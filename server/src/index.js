import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter, requireAuth } from './auth.js';
import { apiRouter } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, apiRouter);

app.use((err, req, res, _next) => {
  if (err.status) return res.status(err.status).json({ error: err.message, ...err.extra });
  console.error(err);
  // Neon במצב שינה או בעיית רשת - החיבור למסד הנתונים נכשל
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(err.code) || /connect|timeout/i.test(err.message)) {
    return res.status(503).json({ error: 'אין חיבור למסד הנתונים כרגע. נסי שוב בעוד כמה שניות.' });
  }
  res.status(500).json({ error: 'שגיאת שרת' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
