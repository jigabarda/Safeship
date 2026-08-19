import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  createBranch,
  getDefaultBranch,
  GitHubApiError,
  openPullRequest,
  putFile,
} from "@/lib/github/repoFiles";
import { applyOverrides, loadManifest, MANIFEST_PATH } from "@/lib/fix/dependencies";
import { resolveOverrideTarget, type OverrideTarget } from "@/lib/fix/advisories";
import { packageRefFromOsvTitle } from "@/lib/scan/groups";

// Pin transitive dependencies to patched versions with npm `overrides`.
//
// This is the only fix available for the majority of advisories: a package the
// repo never declared, so there is no version of its own to raise. An override
// forces a resolution the dependency tree would not have chosen on its own.
//
// Because that is a real intervention, the target is the LOWEST version that
// clears the advisories on the release line already in use — not the newest
// release. See lib/fix/advisories for why that distinction matters.

const MAX_PACKAGES = 20;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id: scanId } = await params;

  let body: { packages?: unknown };
  try {
    body = (await request.json()) as { packages?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const requested = Array.isArray(body.packages)
    ? [...new Set(body.packages.filter((x): x is string => typeof x === "string" && x.length > 0))]
    : [];
  if (requested.length === 0) {
    return Response.json({ error: "Which packages should be pinned?" }, { status: 400 });
  }
  if (requested.length > MAX_PACKAGES) {
    return Response.json(
      { error: `Please pin ${MAX_PACKAGES} or fewer packages at a time.` },
      { status: 400 },
    );
  }

  const scan = await db.scan.findUnique({ where: { id: scanId } });
  if (!scan || scan.userId !== session.user.id) {
    return Response.json({ error: "Scan not found" }, { status: 404 });
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.accessToken) {
    return Response.json(
      { error: "No GitHub token on file — please sign in again." },
      { status: 401 },
    );
  }
  const token = user.accessToken;
  const repo = scan.repoFullName;

  // Group this scan's advisories by package, keeping the installed version.
  const findings = await db.finding.findMany({
    where: { scanId, engine: "osv", dismissed: false },
    select: { ruleId: true, title: true },
  });
  const byPackage = new Map<string, { version: string; ids: string[] }>();
  for (const f of findings) {
    const ref = packageRefFromOsvTitle(f.title);
    if (!ref) continue;
    const entry = byPackage.get(ref.name);
    if (entry) entry.ids.push(f.ruleId);
    else byPackage.set(ref.name, { version: ref.version, ids: [f.ruleId] });
  }

  try {
    const base = await getDefaultBranch(repo, token);
    const manifest = await loadManifest(repo, token, base);
    if (!manifest) {
      return Response.json(
        { error: `No ${MANIFEST_PATH} found in this repository.` },
        { status: 409 },
      );
    }

    const targets: OverrideTarget[] = [];
    const skipped: Array<{ package: string; reason: string }> = [];

    for (const name of requested) {
      const entry = byPackage.get(name);
      if (!entry) {
        skipped.push({ package: name, reason: "no advisories for it on this scan" });
        continue;
      }
      const target = await resolveOverrideTarget(name, entry.version, entry.ids);
      if (!target) {
        skipped.push({
          package: name,
          reason: "no published fix on the release line this repo uses",
        });
        continue;
      }
      targets.push(target);
    }

    if (targets.length === 0) {
      return Response.json(
        { error: "None of those packages have a fix that can be pinned.", skipped },
        { status: 409 },
      );
    }

    const overrides: Record<string, string> = {};
    for (const t of targets) overrides[t.packageName] = `^${t.targetVersion}`;

    const edited = applyOverrides(manifest.content, overrides);
    if (!edited) {
      return Response.json({ error: `Couldn't parse ${MANIFEST_PATH}.` }, { status: 500 });
    }

    const single = targets.length === 1;
    const title = single
      ? `Pin ${targets[0].packageName} to ${overrides[targets[0].packageName]}`
      : `Pin ${targets.length} transitive dependencies to patched versions`;

    const suffix = single
      ? targets[0].packageName.replace(/[^a-zA-Z0-9]+/g, "-")
      : `${targets.length}-packages`;
    const branch = `safeship/override-${suffix}-${scanId.slice(0, 6)}`;
    await createBranch(repo, base, branch, token);
    await putFile(repo, manifest.path, edited.content, title, branch, manifest.sha, token);

    const resolvedCount = targets.reduce(
      (n, t) => n + (t.advisoryIds.length - t.unresolved.length),
      0,
    );
    const majors = targets.filter((t) => t.majorChange);

    const rows = targets
      .map((t) => {
        const resolved = t.advisoryIds.length - t.unresolved.length;
        const note = t.majorChange ? " **major version change**" : "";
        return `| \`${t.packageName}\` | ${t.currentVersion} | ${t.targetVersion} | ${resolved}${note} |`;
      })
      .join("\n");

    const prBody = [
      `Adds npm \`overrides\` pinning ${targets.length} transitive ${single ? "dependency" : "dependencies"} to patched versions, resolving ${resolvedCount} ${resolvedCount === 1 ? "advisory" : "advisories"} reported by Safeship.`,
      "",
      "| package | from | to | advisories |",
      "| --- | --- | --- | --- |",
      rows,
      "",
      "These packages are not declared in this repository — something else pulls them in — so there is no version of their own to raise. An override forces the resolution instead.",
      "",
      "Each target is the lowest version that clears the advisories on the release line already in use, rather than the newest release, to keep the change as small as it can be.",
      majors.length > 0
        ? `\nHeads up: ${majors.map((t) => `\`${t.packageName}\``).join(", ")} ${majors.length === 1 ? "crosses" : "cross"} a major version. Check the changelog before merging.`
        : "",
      edited.reformatted
        ? `\nNote: ${MANIFEST_PATH} was not stored in the formatting this edit produces, so the commit also normalises its formatting.`
        : "",
      "",
      "**Before merging:** run `npm install` so the lockfile picks up the overrides, then test. Forcing a version the dependency tree did not choose can break a package that expected the older one.",
      skipped.length > 0
        ? `\nNot pinned: ${skipped.map((s) => `\`${s.package}\` (${s.reason})`).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const pr = await openPullRequest(repo, branch, base, title, prBody, token);

    return Response.json({
      ok: true,
      pinned: targets.map((t) => ({
        package: t.packageName,
        from: t.currentVersion,
        to: t.targetVersion,
        advisories: t.advisoryIds.length - t.unresolved.length,
        majorChange: t.majorChange,
      })),
      skipped,
      advisoriesResolved: resolvedCount,
      prNumber: pr.number,
      prUrl: pr.htmlUrl,
    });
  } catch (e) {
    if (e instanceof GitHubApiError) {
      return Response.json(
        { error: `GitHub rejected the change: ${e.message}` },
        { status: e.status === 403 || e.status === 404 ? 403 : 502 },
      );
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
