import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  createBranch,
  getDefaultBranch,
  GitHubApiError,
  openPullRequest,
  putFile,
} from "@/lib/github/repoFiles";
import {
  bumpManifest,
  isNewerVersion,
  latestNpmVersion,
  loadManifest,
  MANIFEST_PATH,
  rangeWithSameOperator,
} from "@/lib/fix/dependencies";
import { packageFromOsvTitle } from "@/lib/scan/groups";

// Open a pull request upgrading one vulnerable dependency.
//
// Only direct dependencies. A transitive package cannot be fixed by editing a
// version this repo does not declare, and pretending otherwise would produce a
// pull request that changes nothing — so that case is refused with an
// explanation rather than attempted.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id: scanId } = await params;

  let body: { package?: unknown };
  try {
    body = (await request.json()) as { package?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const packageName = typeof body.package === "string" ? body.package.trim() : "";
  if (!packageName) {
    return Response.json({ error: "Which package should be upgraded?" }, { status: 400 });
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

  // The advisories this upgrade is meant to clear, so the PR can name them.
  const findings = await db.finding.findMany({
    where: { scanId, engine: "osv", dismissed: false },
    select: { ruleId: true, title: true, severity: true },
  });
  const forPackage = findings.filter((f) => packageFromOsvTitle(f.title) === packageName);

  try {
    const base = await getDefaultBranch(repo, token);
    const manifest = await loadManifest(repo, token, base);
    if (!manifest) {
      return Response.json(
        { error: `No ${MANIFEST_PATH} found in this repository, so there is nothing to upgrade.` },
        { status: 409 },
      );
    }

    const dependency = manifest.direct.get(packageName);
    if (!dependency) {
      return Response.json(
        {
          error: `${packageName} is a transitive dependency — it isn't listed in ${MANIFEST_PATH}, so changing a version here wouldn't affect it. It has to be resolved by whatever depends on it, or pinned with an npm "overrides" entry.`,
          transitive: true,
        },
        { status: 409 },
      );
    }

    const latest = await latestNpmVersion(packageName);
    if (!latest) {
      return Response.json(
        { error: `Couldn't look up the latest version of ${packageName} on the npm registry.` },
        { status: 502 },
      );
    }
    if (!isNewerVersion(dependency.range, latest)) {
      return Response.json(
        {
          error: `${MANIFEST_PATH} already asks for ${dependency.range}, which is not behind the latest release (${latest}). The advisory may need a lockfile refresh instead.`,
        },
        { status: 409 },
      );
    }

    const newRange = rangeWithSameOperator(dependency.range, latest);
    const updated = bumpManifest(manifest.content, packageName, newRange);
    if (!updated || updated === manifest.content) {
      return Response.json(
        { error: `Couldn't rewrite ${packageName}'s version in ${MANIFEST_PATH}.` },
        { status: 500 },
      );
    }

    // Branch name is per package + version so a repeat run doesn't collide with
    // an unrelated upgrade already in flight.
    const branch = `safeship/upgrade-${packageName.replace(/[^a-zA-Z0-9]+/g, "-")}-${latest}`;
    await createBranch(repo, base, branch, token);
    await putFile(
      repo,
      manifest.path,
      updated,
      `Upgrade ${packageName} to ${newRange}`,
      branch,
      manifest.sha,
      token,
    );

    const advisories = forPackage
      .map((f) => `- ${f.ruleId} (${f.severity}) — ${f.title}`)
      .join("\n");
    const prBody = [
      `Upgrades \`${packageName}\` from \`${dependency.range}\` to \`${newRange}\`.`,
      "",
      forPackage.length > 0
        ? `Resolves ${forPackage.length} advisor${forPackage.length === 1 ? "y" : "ies"} reported by Safeship:\n\n${advisories}`
        : "Reported by Safeship.",
      "",
      "**Before merging:** run your package manager's install so the lockfile matches this change, and check that nothing depends on the old major version. Only `package.json` is edited here — the lockfile is generated and is left to your tooling.",
    ].join("\n");

    const pr = await openPullRequest(
      repo,
      branch,
      base,
      `Upgrade ${packageName} to ${newRange}`,
      prBody,
      token,
    );

    return Response.json({
      ok: true,
      package: packageName,
      from: dependency.range,
      to: newRange,
      advisories: forPackage.length,
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
