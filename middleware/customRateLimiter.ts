import { Request, Response, NextFunction } from "express";

interface RateLimiterOptions {
  windowMs: number;
  maxRequest: number;
}

interface StoreEntry {
  count: number;
  startTime: number;
}

const customRateLimiter = ({ windowMs, maxRequest }: RateLimiterOptions) => {
  const store = new Map<string, StoreEntry>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.startTime > windowMs) store.delete(key);
    }
  }, windowMs).unref();

  return function (req: Request, res: Response, next: NextFunction) {
    const key = req.ip ?? "unknown-ip";
    const now = Date.now();
    const existing = store.get(key);

    if (!existing || now - existing.startTime > windowMs) {
      store.set(key, { count: 1, startTime: now });
      return next();
    }

    if (existing.count >= maxRequest) {
      return res.status(429).json({ message: "Too many requests, please try again later." });
    }

    existing.count += 1;
    return next();
  };
};

export default customRateLimiter;
