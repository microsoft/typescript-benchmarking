/** @internal */
namespace ts {
    export function createGetSymbolWalker(
        getRestTypeOfSignature: (sig: Signature) => Type,
        getReturnTypeOfSignature: (sig: Signature) => Type,
        getBaseTypes: (type: Type) => Type[],
        resolveStructuredTypeMembers: (type: ObjectType) => ResolvedType,
        getTypeOfSymbol: (sym: Symbol) => Type,
        getResolvedSymbol: (node: Node) => Symbol,
        getIndexTypeOfStructuredType: (type: Type, kind: IndexKind) => Type,
        getConstraintFromTypeParameter: (typeParameter: TypeParameter) => Type,
        getFirstIdentifier: (node: EntityNameOrEntityNameExpression) => Identifier) {

        return getSymbolWalker;

        function getSymbolWalker(accept: (symbol: Symbol) => boolean = () => true): SymbolWalker {
            const visitedTypes = createMap<Type>(); // Key is id as string
            const visitedSymbols = createMap<Symbol>(); // Key is id as string

            return {
                walkType: type => {
                    visitedTypes.clear();
                    visitedSymbols.clear();
                    visitType(type);
                    return { visitedTypes: arrayFrom(visitedTypes.values()), visitedSymbols: arrayFrom(visitedSymbols.values()) };
                },
                walkSymbol: symbol => {
                    visitedTypes.clear();
                    visitedSymbols.clear();
                    visitSymbol(symbol);
                    return { visitedTypes: arrayFrom(visitedTypes.values()), visitedSymbols: arrayFrom(visitedSymbols.values()) };
                },
            };

            function visitType(type: Type): void {
                if (!type) {
                    return;
                }

                const typeIdString = type.id.toString();
                if (visitedTypes.has(typeIdString)) {
                    return;
                }
                visitedTypes.set(typeIdString, type);

                // Reuse visitSymbol to visit the type's symbol,
                //  but be sure to bail on recuring into the type if accept declines the symbol.
                const shouldBail = visitSymbol(type.symbol);
                if (shouldBail) return;

                // Visit the type's related types, if any
                if (type.flags & TypeFlags.Object) {
                    const objectType = type as ObjectType;
                    const objectFlags = objectType.objectFlags;
                    if (objectFlags & ObjectFlags.Reference) {
                        visitTypeReference(type as TypeReference);
                    }
                    if (objectFlags & ObjectFlags.Mapped) {
                        visitMappedType(type as MappedType);
                    }
                    if (objectFlags & (ObjectFlags.Class | ObjectFlags.Interface)) {
                        visitInterfaceType(type as InterfaceType);
                    }
                    if (objectFlags & (ObjectFlags.Tuple | ObjectFlags.Anonymous)) {
                        visitObjectType(objectType);
                    }
                }
                if (type.flags & TypeFlags.TypeParameter) {
                    visitTypeParameter(type as TypeParameter);
                }
                if (type.flags & TypeFlags.UnionOrIntersection) {
                    visitUnionOrIntersectionType(type as UnionOrIntersectionType);
                }
                if (type.flags & TypeFlags.Index) {
                    visitIndexType(type as IndexType);
                }
                if (type.flags & TypeFlags.IndexedAccess) {
                    visitIndexedAccessType(type as IndexedAccessType);
                }
            }

            function visitTypeList(types: Type[]): void {
                if (!types) {
                    return;
                }
                for (let i = 0; i < types.length; i++) {
                    visitType(types[i]);
                }
            }

            function visitTypeReference(type: TypeReference): void {
                visitType(type.target);
                visitTypeList(type.typeArguments);
            }

            function visitTypeParameter(type: TypeParameter): void {
                visitType(getConstraintFromTypeParameter(type));
            }

            function visitUnionOrIntersectionType(type: UnionOrIntersectionType): void {
                visitTypeList(type.types);
            }

            function visitIndexType(type: IndexType): void {
                visitType(type.type);
            }

            function visitIndexedAccessType(type: IndexedAccessType): void {
                visitType(type.objectType);
                visitType(type.indexType);
                visitType(type.constraint);
            }

            function visitMappedType(type: MappedType): void {
                visitType(type.typeParameter);
                visitType(type.constraintType);
                visitType(type.templateType);
                visitType(type.modifiersType);
            }

            function visitSignature(signature: Signature): void {
                if (signature.typePredicate) {
                    visitType(signature.typePredicate.type);
                }
                visitTypeList(signature.typeParameters);

                for (const parameter of signature.parameters){
                    visitSymbol(parameter);
                }
                visitType(getRestTypeOfSignature(signature));
                visitType(getReturnTypeOfSignature(signature));
            }

            function visitInterfaceType(interfaceT: InterfaceType): void {
                visitObjectType(interfaceT);
                visitTypeList(interfaceT.typeParameters);
                visitTypeList(getBaseTypes(interfaceT));
                visitType(interfaceT.thisType);
            }

            function visitObjectType(type: ObjectType): void {
                const stringIndexType = getIndexTypeOfStructuredType(type, IndexKind.String);
                visitType(stringIndexType);
                const numberIndexType = getIndexTypeOfStructuredType(type, IndexKind.Number);
                visitType(numberIndexType);

                // The two checks above *should* have already resolved the type (if needed), so this should be cached
                const resolved = resolveStructuredTypeMembers(type);
                for (const signature of resolved.callSignatures) {
                    visitSignature(signature);
                }
                for (const signature of resolved.constructSignatures) {
                    visitSignature(signature);
                }
                for (const p of resolved.properties) {
                    visitSymbol(p);
                }
            }

            function visitSymbol(symbol: Symbol): boolean {
                if (!symbol) {
                    return;
                }
                const symbolIdString = getSymbolId(symbol).toString();
                if (visitedSymbols.has(symbolIdString)) {
                    return;
                }
                visitedSymbols.set(symbolIdString, symbol);
                if (!accept(symbol)) {
                    return true;
                }
                const t = getTypeOfSymbol(symbol);
                visitType(t); // Should handle members on classes and such
                if (symbol.flags & SymbolFlags.HasExports) {
                    symbol.exports.forEach(visitSymbol);
                }
                forEach(symbol.declarations, d => {
                    // Type queries are too far resolved when we just visit the symbol's type
                    //  (their type resolved directly to the member deeply referenced)
                    // So to get the intervening symbols, we need to check if there's a type
                    // query node on any of the symbol's declarations and get symbols there
                    if ((d as any).type && (d as any).type.kind === SyntaxKind.TypeQuery) {
                        const query = (d as any).type as TypeQueryNode;
                        const entity = getResolvedSymbol(getFirstIdentifier(query.exprName));
                        visitSymbol(entity);
                    }
                });
            }
        }
    }
}