export interface IClientConfiguration {
    sid: string;
    clientId: string;
    clientIdEnv: string;
    secret: string;
    secretEnv: string;
    realmURL: {
        public: string;
        private: string;
    };
}
