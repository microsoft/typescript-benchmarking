import stream from "node:stream";

export function pipeAsync(input: stream.Stream, output: NodeJS.WritableStream, options?: { end?: boolean; }) {
    return new Promise<void>((resolve, reject) => {
        const stream = input.pipe(output, options);
        const cleanup = () => {
            stream.removeListener("finish", onevent);
            stream.removeListener("unpipe", onevent);
            stream.removeListener("error", onerror);
        };
        const onevent = () => {
            resolve();
            cleanup();
        };
        const onerror = (err: any) => {
            reject(err);
            cleanup();
        };
        stream.once("finish", onevent);
        stream.once("unpipe", onevent);
        stream.once("error", onerror);
    });
}
