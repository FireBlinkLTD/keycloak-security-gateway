export interface IResourceDefinition {
    match: string;
    matchPattern?: RegExp;
    clientId?: string;
    override?: string;
    whitelisted?: boolean;
    methods?: string[];
    roles?: {
        any?: string[];
        all?: string[];
    };
    ssoFlow?: boolean;
}
