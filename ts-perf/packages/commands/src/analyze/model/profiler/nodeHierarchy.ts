import { HierarchyProvider, Queryable } from "iterable-query";

import { CpuProfileNode } from "./node";
import { CpuProfile } from "./profile";

export class CpuProfileNodeHierarchy implements HierarchyProvider<CpuProfileNode> {
    public profile: CpuProfile;
    constructor(profile: CpuProfile) {
        this.profile = profile;
    }
    owns(node: CpuProfileNode): boolean {
        return node.profile === this.profile;
    }
    parent(node: CpuProfileNode): CpuProfileNode | undefined {
        return node.parent;
    }
    children(node: CpuProfileNode): Queryable<CpuProfileNode> | undefined {
        return node.children;
    }
}
