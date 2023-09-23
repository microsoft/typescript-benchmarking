import * as vm from "node:vm";

import { Range, TimeSpan } from "@ts-perf/api";
import { fn, from, Lazy, Query } from "iterable-query";

import { Category } from "./category";
import { CpuProfile } from "./profile";

export function createCpuProfileContext(profile: CpuProfile): vm.Context {
    const lazyNodes = Lazy.from(() => from(profile.nodes));
    const lazyFunctions = Lazy.from(() => from(profile.functions));
    const lazyFiles = Lazy.from(() => from(profile.files));
    const lazyCategories = Lazy.from(() => from(profile.categories));
    const lazyEventRanges = Lazy.from(() => from(profile.eventRanges));
    const context = {
        Query,
        fn,
        Category,
        TimeSpan,
        Range,
        get profile() {
            return profile;
        },
        get nodes() {
            return lazyNodes.value.orderByDescending(node => node.selfCount);
        },
        get functions() {
            return lazyFunctions.value.orderByDescending(node => node.selfCount);
        },
        get user_functions() {
            return lazyFunctions.value.where(node => node.isUserCode).orderByDescending(node => node.selfCount);
        },
        get native_functions() {
            return lazyFunctions.value.where(node => node.isNativeCode).orderByDescending(node => node.selfCount);
        },
        get node_functions() {
            return lazyFunctions.value.where(node => node.isNodeCode).orderByDescending(node => node.selfCount);
        },
        get profiler_functions() {
            return lazyFunctions.value.where(node => node.isProfilerCode).orderByDescending(node => node.selfCount);
        },
        get system_functions() {
            return lazyFunctions.value.where(node => node.isSystemCode).orderByDescending(node => node.selfCount);
        },
        get compiler_functions() {
            return lazyFunctions.value.where(node => node.hasCategory(Category.compiler)).orderByDescending(node =>
                node.selfCount
            );
        },
        get parser_functions() {
            return lazyFunctions.value.where(node => node.hasCategory(Category.parser)).orderByDescending(node =>
                node.selfCount
            );
        },
        get binder_functions() {
            return lazyFunctions.value.where(node => node.hasCategory(Category.binder)).orderByDescending(node =>
                node.selfCount
            );
        },
        get checker_functions() {
            return lazyFunctions.value.where(node => node.hasCategory(Category.checker)).orderByDescending(node =>
                node.selfCount
            );
        },
        get emitter_functions() {
            return lazyFunctions.value.where(node => node.hasCategory(Category.emitter)).orderByDescending(node =>
                node.selfCount
            );
        },
        get deoptimized_functions() {
            return lazyFunctions.value.where(node => node.bailoutCount > 0).orderByDescending(node =>
                node.bailoutCount
            );
        },
        get files() {
            return lazyFiles.value.orderByDescending(node => node.selfCount);
        },
        get categories() {
            return lazyCategories.value.orderByDescending(node => node.selfCount);
        },
        get eventRanges() {
            return lazyEventRanges.value.orderByDescending(node => node.selfCount);
        },
    };
    vm.createContext(context);
    return context;
}
