import { Octokit } from "@octokit/rest";
import fs from "fs";

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

    const [fragment] = process.argv.slice(2);
    if (!fragment) throw new Error("First argument must be a path to an HTML fragment.");

    const gh = new Octokit({ auth });
    try {
        console.log(`Loading fragment from ${fragment}...`);
        const outputTableText = fs.readFileSync(fragment, { encoding: "utf8" });
        console.log(`Fragment contents:\n${outputTableText}`);

        const artifactLink =
            `\n<details><summary>Developer Information:</summary><p><a href="https://typescript.visualstudio.com/TypeScript/_build/results?buildId=${buildId}&view=artifacts">Download Benchmarks</a></p></details>\n`;

        const data = await gh.issues.createComment({
            issue_number: +source,
            owner: "Microsoft",
            repo: "TypeScript",
            body:
                `@${requester}\nThe results of the perf run you requested are in!\n<details><summary> Here they are:</summary><p>\n${outputTableText}\n</p>${artifactLink}</details>`,
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
