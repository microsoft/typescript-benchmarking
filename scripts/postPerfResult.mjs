import fs from "node:fs";

import { Octokit } from "@octokit/rest";
import minimist from "minimist";

async function main() {
    const source = process.env.SOURCE_ISSUE;
    if (!source) throw new Error("SOURCE_ISSUE environment variable not set.");

    const requester = process.env.REQUESTING_USER;
    if (!requester) throw new Error("REQUESTING_USER environment variable not set.");

    const buildId = process.env.BUILD_BUILDID;
    if (!buildId) throw new Error("BUILD_BUILDID environment variable not set.");

    const postedComment = process.env.STATUS_COMMENT;
    if (!postedComment) throw new Error("STATUS_COMMENT environment variable not set.");

    const auth = process.env.GH_TOKEN;
    if (!auth) throw new Error("GH_TOKEN environment variable not set.");

    const args = minimist(process.argv.slice(2), {
        string: ["fragment"],
        boolean: ["failed"],
    });

    const gh = new Octokit({ auth });
    try {
        let body;
        if (args.failed) {
            body =
                `@${requester}, the perf run you requested failed. [You can check the log here](https://typescript.visualstudio.com/TypeScript/_build/index?buildId=${buildId}&_a=summary).`;
        }
        else {
            const fragment = args.fragment;
            if (!fragment) throw new Error("Expected --fragment to be set.");

            console.log(`Loading fragment from ${fragment}...`);
            const outputTableText = fs.readFileSync(fragment, { encoding: "utf8" });
            console.log(`Fragment contents:\n${outputTableText}`);

            const artifactLink =
                `\n<details><summary>Developer Information:</summary><p><a href="https://typescript.visualstudio.com/TypeScript/_build/results?buildId=${buildId}&view=artifacts">Download Benchmarks</a></p></details>\n`;
            body =
                `@${requester}\nThe results of the perf run you requested are in!\n<details><summary> Here they are:</summary><p>\n${outputTableText}\n</p>${artifactLink}</details>`;
        }

        const data = await gh.issues.createComment({
            issue_number: +source,
            owner: "Microsoft",
            repo: "TypeScript",
            body,
        });

        console.log(`Results posted!`);
        const newCommentUrl = data.data.html_url;
        const comment = await gh.issues.getComment({
            owner: "Microsoft",
            repo: "TypeScript",
            comment_id: +postedComment,
        });
        const newBody = `${comment.data.body}\n\nUpdate: [The results are in!](${newCommentUrl})`;
        await gh.issues.updateComment({
            owner: "Microsoft",
            repo: "TypeScript",
            comment_id: +postedComment,
            body: newBody,
        });
    }
    catch (e) {
        console.error(e);
        const gh = new Octokit({ auth });
        await gh.issues.createComment({
            issue_number: +source,
            owner: "Microsoft",
            repo: "TypeScript",
            body:
                `Hey @${requester}, something went wrong when publishing results. ([You can check the log here](https://typescript.visualstudio.com/TypeScript/_build/index?buildId=${buildId}&_a=summary)).`,
        });
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
