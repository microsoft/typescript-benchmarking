import fs from "node:fs";

import minimist from "minimist";
import { Octokit } from "octokit";

async function main() {
    const SOURCE_ISSUE = process.env.SOURCE_ISSUE;
    if (!SOURCE_ISSUE) throw new Error("SOURCE_ISSUE environment variable not set.");

    const REQUESTING_USER = process.env.REQUESTING_USER;
    if (!REQUESTING_USER) throw new Error("REQUESTING_USER environment variable not set.");

    const BUILD_BUILDID = process.env.BUILD_BUILDID;
    if (!BUILD_BUILDID) throw new Error("BUILD_BUILDID environment variable not set.");

    const STATUS_COMMENT = process.env.STATUS_COMMENT;
    if (!STATUS_COMMENT) throw new Error("STATUS_COMMENT environment variable not set.");

    const DISTINCT_ID = process.env.DISTINCT_ID;
    if (!DISTINCT_ID) throw new Error("DISTINCT_ID environment variable not set.");

    const GH_TOKEN = process.env.GH_TOKEN;
    if (!GH_TOKEN) throw new Error("GH_TOKEN environment variable not set.");

    const args = minimist(process.argv.slice(2), {
        string: ["fragment"],
        boolean: ["failed"],
    });

    const gh = new Octokit({ auth: GH_TOKEN });
    let body;
    if (args.failed) {
        body =
            `@${REQUESTING_USER}, the perf run you requested failed. [You can check the log here](https://typescript.visualstudio.com/TypeScript/_build/index?buildId=${BUILD_BUILDID}&_a=summary).`;
    }
    else {
        const fragment = args.fragment;
        if (!fragment) throw new Error("Expected --fragment to be set.");

        console.log(`Loading fragment from ${fragment}...`);
        const outputTableText = fs.readFileSync(fragment, { encoding: "utf8" });
        console.log(`Fragment contents:\n${outputTableText}`);

        const artifactLink =
            `\n<details><summary>Developer Information:</summary><p><a href="https://typescript.visualstudio.com/TypeScript/_build/results?buildId=${BUILD_BUILDID}&view=artifacts">Download Benchmarks</a></p></details>\n`;
        body =
            `@${REQUESTING_USER}\nThe results of the perf run you requested are in!\n<details><summary> Here they are:</summary><p>\n${outputTableText}\n</p>${artifactLink}</details>`;
    }

    const resultsComment = await gh.rest.issues.createComment({
        issue_number: +SOURCE_ISSUE,
        owner: "Microsoft",
        repo: "TypeScript",
        body,
    });

    console.log(`Results posted!`);

    const emoji = !args.failed ? "✅" : "❌";

    const toReplace = `<!--result-${DISTINCT_ID}-->`;
    let posted = false;
    for (let i = 0; i < 5; i++) {
        // Get status comment contents
        const statusComment = await gh.rest.issues.getComment({
            comment_id: +STATUS_COMMENT,
            owner: "Microsoft",
            repo: "TypeScript",
        });

        const oldComment = statusComment.data.body;
        if (!oldComment?.includes(toReplace)) {
            posted = true;
            break;
        }

        const newComment = oldComment.replace(
            toReplace,
            `[${emoji} Results](${resultsComment.data.html_url})`,
        );

        // Update status comment
        await gh.rest.issues.updateComment({
            comment_id: +STATUS_COMMENT,
            owner: "Microsoft",
            repo: "TypeScript",
            body: newComment,
        });

        // Repeat; someone may have edited the comment at the same time.
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!posted) {
        throw new Error("Failed to update status comment");
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
