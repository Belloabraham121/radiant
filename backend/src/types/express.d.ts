declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user: {
        privyUserId: string;
        sessionId: string;
      };
    }
  }
}

export {};
