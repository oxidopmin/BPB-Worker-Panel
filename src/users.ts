import { isValidUUID } from '@common';

const USERS_KV_KEY = 'panelUsers';

export function createRandomId(length = 16): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const random = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(random, value => chars[value % chars.length]).join('');
}

export function createUUID(): string {
    return crypto.randomUUID();
}

export function createTrojanPassword(): string {
    return createRandomId(24);
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeUser(input: Partial<PanelUser>, index: number): PanelUser {
    const now = Date.now();
    const name = String(input.name ?? `user-${index + 1}`).trim() || `user-${index + 1}`;
    const uuid = String(input.uuid ?? '').trim();
    const subId = String(input.subId ?? '').trim();
    const trPassword = String(input.trPassword ?? '').trim();

    if (!isValidUUID(uuid)) {
        throw new Error(`Invalid user UUID for ${name}`);
    }

    if (!subId) {
        throw new Error(`subId is required for ${name}`);
    }

    if (!trPassword) {
        throw new Error(`trPassword is required for ${name}`);
    }

    return {
        id: String(input.id ?? crypto.randomUUID()),
        name,
        uuid,
        subId,
        trPassword,
        dataLimitGB: Math.max(0, normalizeNumber(input.dataLimitGB, 0)),
        dataUsedBytes: Math.max(0, normalizeNumber(input.dataUsedBytes, 0)),
        expireAt: normalizeNumber(input.expireAt, 0),
        createdAt: normalizeNumber(input.createdAt, now),
        updatedAt: now,
        enabled: input.enabled !== false
    };
}

export async function getUsers(env: Env): Promise<PanelUser[]> {
    const users = await env.kv.get(USERS_KV_KEY, { type: 'json' }) as PanelUser[] | null;

    if (Array.isArray(users) && users.length) {
        return users;
    }

    if (env.UUID && env.TR_PASS && isValidUUID(env.UUID)) {
        const bootstrapUser = normalizeUser({
            id: crypto.randomUUID(),
            name: 'default-user',
            uuid: env.UUID,
            subId: env.UUID,
            trPassword: env.TR_PASS,
            dataLimitGB: 0,
            dataUsedBytes: 0,
            expireAt: 0,
            enabled: true,
            createdAt: Date.now()
        }, 0);

        await saveUsers(env, [bootstrapUser]);
        return [bootstrapUser];
    }

    return [];
}

export async function saveUsers(env: Env, users: PanelUser[]): Promise<void> {
    await env.kv.put(USERS_KV_KEY, JSON.stringify(users));
}

export function getUserStatus(user: PanelUser, now = Date.now()) {
    if (!user.enabled) {
        return { active: false, reason: 'disabled' };
    }

    if (user.expireAt > 0 && now > user.expireAt) {
        return { active: false, reason: 'expired' };
    }

    const dataLimitBytes = user.dataLimitGB > 0 ? user.dataLimitGB * 1024 * 1024 * 1024 : 0;
    if (dataLimitBytes > 0 && user.dataUsedBytes >= dataLimitBytes) {
        return { active: false, reason: 'data-limit-reached' };
    }

    return { active: true, reason: 'ok' };
}

export async function findUserBySubId(env: Env, subId: string): Promise<PanelUser | null> {
    const users = await getUsers(env);
    return users.find(user => user.subId === subId) ?? null;
}

export async function findUserByUUID(env: Env, uuid: string): Promise<PanelUser | null> {
    const users = await getUsers(env);
    return users.find(user => user.uuid === uuid) ?? null;
}

export async function findUserByTrojanHash(env: Env, hash: string): Promise<PanelUser | null> {
    const users = await getUsers(env);
    return users.find(user => sha224(user.trPassword) === hash) ?? null;
}

export async function addUserUsage(env: Env, userId: string, bytes: number): Promise<void> {
    if (!bytes || bytes <= 0) return;

    const users = await getUsers(env);
    const target = users.find(user => user.id === userId);
    if (!target) return;

    target.dataUsedBytes = Math.max(0, (target.dataUsedBytes ?? 0) + bytes);
    target.updatedAt = Date.now();
    await saveUsers(env, users);
}

function sha224(string: string): string {
    const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));

    const h = [
        0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
        0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4
    ];

    const k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    const utf8 = Array.from(new TextEncoder().encode(string));
    const bytes = [...utf8];
    const bitLength = bytes.length * 8;

    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);

    const lengthHi = Math.floor(bitLength / 0x100000000);
    const lengthLo = bitLength & 0xffffffff;

    for (let i = 3; i >= 0; i--) bytes.push((lengthHi >> (i * 8)) & 0xff);
    for (let i = 3; i >= 0; i--) bytes.push((lengthLo >> (i * 8)) & 0xff);

    for (let i = 0; i < bytes.length; i += 64) {
        const w = new Array(64).fill(0);
        for (let j = 0; j < 16; j++) {
            w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
        }

        for (let j = 16; j < 64; j++) {
            const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
            const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }

        let [a, b, c, d, e, f, g, hh] = h;

        for (let j = 0; j < 64; j++) {
            const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (hh + S1 + ch + k[j] + w[j]) >>> 0;
            const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;

            hh = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        h[0] = (h[0] + a) >>> 0;
        h[1] = (h[1] + b) >>> 0;
        h[2] = (h[2] + c) >>> 0;
        h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0;
        h[5] = (h[5] + f) >>> 0;
        h[6] = (h[6] + g) >>> 0;
        h[7] = (h[7] + hh) >>> 0;
    }

    return h.slice(0, 7).map(val => val.toString(16).padStart(8, '0')).join('');
}
