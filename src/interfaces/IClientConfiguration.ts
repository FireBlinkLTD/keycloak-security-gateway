export interface IClientConfiguration {
    clientId: string;
    secret: string;
    realmURL: {
        public: string;
        private: string;
    };
}
