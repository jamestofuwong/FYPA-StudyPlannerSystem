import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import bcrypt from 'bcryptjs';
import { sessionOptions, type SessionData } from '../../../../lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const validUsername = process.env.ADMIN_USERNAME;
  const hashB64 = process.env.ADMIN_PASSWORD_HASH_B64;

  if (!validUsername || !hashB64) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  const validPasswordHash = Buffer.from(hashB64, 'base64').toString('utf-8');

  const usernameMatch = username === validUsername;
  const passwordMatch = await bcrypt.compare(password, validPasswordHash);

  if (!usernameMatch || !passwordMatch) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.isLoggedIn = true;
  await session.save();

  return res;
}
