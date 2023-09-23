import * as inspector from "@ts-perf/inspector";

const nativePattern = /^native /;
const nodePattern = /^(internal\/|[a-z0-9_]+(\.js)?$)/i;
const profilerPattern = /[\\/](profiler|inspector)[\\/]/i;
const compilerPattern =
    /[\\/]src[\\/]compiler[\\/](?:(?:(parser|scanner)|(binder)|(checker)|(transformer|transformers[\\/].*|visitor|factory)|(emitter|sourcemap|comments))\.ts)?/i;

export class Category {
    private static readonly categories = new Map<string, Category>();

    static readonly native = Category.get("native");
    static readonly node = Category.get("node");
    static readonly system = Category.get("system");
    static readonly meta = Category.get("meta", Category.system);
    static readonly gc = Category.get("gc", Category.meta);
    static readonly program = Category.get("program", Category.meta);
    static readonly idle = Category.get("idle", Category.meta);
    static readonly user = Category.get("user");
    static readonly compiler = Category.get("compiler", Category.user);
    static readonly parser = Category.get("parser", Category.compiler);
    static readonly binder = Category.get("binder", Category.compiler);
    static readonly checker = Category.get("checker", Category.compiler);
    static readonly emitter = Category.get("emitter", Category.compiler);
    static readonly transformer = Category.get("transformer", Category.emitter);
    static readonly profiler = Category.get("profiler");
    static readonly other = Category.get("other");

    readonly name: string;
    readonly parent: Category | undefined;

    private _children: Category[] = [];

    private constructor(name: string, parent: Category | undefined) {
        this.name = name;
        this.parent = parent;
        if (parent) parent._children.push(this);
    }

    get children(): readonly Category[] {
        return this._children;
    }

    get path(): string {
        return this.parent ? `${this.parent.path}\\${this.name}` : this.name;
    }

    static get(name: string, parent?: Category) {
        if (this.categories.has(name)) {
            return this.categories.get(name)!;
        }
        const category = new Category(name, parent);
        this.categories.set(name, category);
        return category;
    }

    static for(node: inspector.ProfileNode) {
        const url = node.callFrame.url;
        if (!url) {
            const functionName = node.callFrame.functionName;
            return functionName === "(garbage collector)" ? Category.gc
                : functionName === "(program)" ? Category.program
                : functionName === "(idle)" ? Category.idle
                : Category.system;
        }
        if (nativePattern.test(url)) return Category.native;
        if (profilerPattern.test(url)) return Category.profiler;
        if (nodePattern.test(url)) return Category.node;
        const match = compilerPattern.exec(url);
        return !match ? Category.user
            : match[1] ? Category.parser
            : match[2] ? Category.binder
            : match[3] ? Category.checker
            : match[4] ? Category.transformer
            : match[5] ? Category.emitter
            : Category.compiler;
    }

    static reduce(categories: Iterable<Category>): Category[] {
        const reducedCategories = new Set<Category>();
        for (const candidateCategory of categories) {
            for (const reducedCategory of reducedCategories) {
                // if the candidateCategory is equal to or less derived than the reducedCategory, ignore it
                if (reducedCategory.isCategory(candidateCategory)) {
                    continue;
                }
                // if the candidateCategory is more derived than the reducedCategory, replace it
                if (candidateCategory.isCategory(reducedCategory)) {
                    reducedCategories.delete(reducedCategory);
                }
            }
            reducedCategories.add(candidateCategory);
        }
        return [...reducedCategories];
    }

    isCategory(category: Category | string): boolean {
        return (typeof category === "string" ? this.name === category : this === category)
            || (!!this.parent && this.parent.isCategory(category));
    }

    toString() {
        return this.name;
    }
}
