declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        role: "student" | "admin";
      };
    }
  }
}

export {};
