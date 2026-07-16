import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The fake secrets planted in the fixture. They are ASSEMBLED FROM PARTS at
// runtime on purpose: the whole point is that gitleaks detects them in the
// generated file, but keeping a contiguous token literal out of the source
// avoids tripping GitHub's push-protection secret scanner on this repo.
const AWS_KEY = ["AKIA", "Y43FZ4B7", "KX2QNVPL"].join("");
const AWS_SECRET = ["wJalrXUtnFEMI", "K7MDENG", "bPxRfiCYFAKEKEYVALUE1"].join("/");
const SLACK_TOKEN = ["xoxb", "123456789012", "1234567890123", "abcdefghijklmnopqrstuvwx"].join("-");

export const PLANTED_SECRETS = {
  awsKey: AWS_KEY,
  slackToken: SLACK_TOKEN,
};

/** Create a throwaway fixture: leaked secrets + a vulnerable lodash lockfile. */
export async function makeFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shipsafe-fixture-"));

  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(
    join(dir, "config", "credentials.txt"),
    [
      "# App credentials (planted fixture — not real)",
      `aws_access_key_id = ${AWS_KEY}`,
      `aws_secret_access_key = ${AWS_SECRET}`,
      `slack_token = ${SLACK_TOKEN}`,
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    join(dir, "package.json"),
    JSON.stringify(
      { name: "vulnerable-fixture", version: "1.0.0", dependencies: { lodash: "4.17.11" } },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(dir, "package-lock.json"),
    JSON.stringify(
      {
        name: "vulnerable-fixture",
        version: "1.0.0",
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": { name: "vulnerable-fixture", version: "1.0.0", dependencies: { lodash: "4.17.11" } },
          "node_modules/lodash": {
            version: "4.17.11",
            resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.11.tgz",
            integrity: "sha512-fixturefixturefixturefixturefixturefixture==",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return dir;
}
