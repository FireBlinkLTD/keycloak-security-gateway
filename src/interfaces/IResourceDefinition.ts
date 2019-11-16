export interface IResourceDefinition {
    match: string;
    matchPattern: RegExp;
    override?: string;
    whitelisted?: boolean;
    methods?: string[];
    roles?: {
        any?: string[];
        all?: string[];
    };
    ssoFlow: boolean;
}
