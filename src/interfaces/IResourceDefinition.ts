import { IClientConfiguration } from './IClientConfiguration';

export interface IResourceDefinition {
    match: string;
    matchPattern?: RegExp;
    clientId?: string;
    clientConfiguration?: IClientConfiguration;
    override?: string;
    public?: boolean;
    methods?: string[];
    roles?: {
        any?: string[];
        all?: string[];
    };
    ssoFlow?: boolean;
}
