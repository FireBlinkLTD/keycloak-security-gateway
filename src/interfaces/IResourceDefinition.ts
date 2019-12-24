export interface IResourceDefinition {
    match: string;
    matchPattern?: RegExp;
    clientId?: string;
    override?: string;
    public?: boolean;
    methods?: string[];
    roles?: {
        any?: string[];
        all?: string[];
    };
    ssoFlow?: boolean;
}
