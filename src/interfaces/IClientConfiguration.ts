export interface IClientConfiguration {
    sid: string;
    clientId: string;
    secret: string;
    realmURL: {
        public: string;
        private: string;
    };
}
