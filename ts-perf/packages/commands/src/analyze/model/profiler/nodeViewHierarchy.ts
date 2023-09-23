// import { HierarchyProvider, Queryable } from "iterable-query";
// import { CpuProfileNodeView } from "./nodeView";
// import { CpuProfileView } from "./profileView";

// export class CpuProfileNodeViewHierarchy implements HierarchyProvider<CpuProfileNodeView> {
//     public profileView: CpuProfileView;
//     constructor(profile: CpuProfileView) {
//         this.profileView = profile;
//     }
//     owns(node: CpuProfileNodeView): boolean { return node.profileView === this.profileView; }
//     parent(node: CpuProfileNodeView): CpuProfileNodeView | undefined { return node.parent; }
//     children(node: CpuProfileNodeView): Queryable<CpuProfileNodeView> | undefined { return node.childNodes; }
// }

export {};
