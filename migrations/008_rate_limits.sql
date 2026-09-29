-- অনুরোধের সংখ্যা সীমা (rate limiting) — কোনো বাইরের সার্ভিস ছাড়াই D1 দিয়ে কাজ করে
-- চালানোর কমান্ড: npm run db:migrate:ratelimits
CREATE TABLE IF NOT EXISTS rate_limits (
  k   TEXT NOT NULL,      -- যেমন "login:1.2.3.4"
  w   INTEGER NOT NULL,   -- সময়ের জানালা নম্বর
  n   INTEGER NOT NULL,   -- এই জানালায় কতবার
  exp INTEGER NOT NULL,   -- জানালা শেষের সময় (unix সেকেন্ড) — পুরনো রো মুছতে লাগে
  PRIMARY KEY (k, w)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_exp ON rate_limits(exp);
