
import bcrypt from 'bcryptjs';
import { db } from './databaseService';
import { RegisteredPharmacy } from '../types';

const SESSION_KEY = 'medimart_session';

export class AuthService {
    async register(email: string, pass: string, fullName: string, pharmacyName: string): Promise<RegisteredPharmacy> {
        const organization_id = crypto.randomUUID();
        const user_id = crypto.randomUUID();
        const password_hash = await bcrypt.hash(pass, 10);

        await db.sql`
            INSERT INTO users (id, organization_id, email, password_hash, full_name, role)
            VALUES (${user_id}, ${organization_id}, ${email}, ${password_hash}, ${fullName}, 'owner')
        `;

        const profile: RegisteredPharmacy = {
            id: user_id,
            user_id: user_id,
            organization_id,
            email,
            full_name: fullName,
            pharmacy_name: pharmacyName,
            role: 'owner',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        } as any;

        // Convert types to string for SQLite if necessary, but sqlocal handles params
        await db.sql`
            INSERT INTO profiles (user_id, organization_id, email, full_name, pharmacy_name, role, is_active)
            VALUES (${user_id}, ${organization_id}, ${email}, ${fullName}, ${pharmacyName}, 'owner', 1)
        `;

        // Initialize default configuration
        await db.sql`
            INSERT INTO configurations (id, organization_id)
            VALUES (${crypto.randomUUID()}, ${organization_id})
        `;

        this.setSession(user_id);
        return profile;
    }

    async login(email: string, pass: string): Promise<RegisteredPharmacy> {
        const users = await db.sql`SELECT * FROM users WHERE email = ${email}`;
        if (users.length === 0) {
            throw new Error('User not found.');
        }

        const user = users[0];
        const isValid = await bcrypt.compare(pass, user.password_hash);
        if (!isValid) {
            throw new Error('Invalid password.');
        }

        const profiles = await db.sql`SELECT * FROM profiles WHERE user_id = ${user.id}`;
        if (profiles.length === 0) {
            throw new Error('Profile not found.');
        }

        const profile = this.mapProfile(profiles[0]);
        this.setSession(user.id);
        return profile;
    }

    async getCurrentUser(): Promise<RegisteredPharmacy | null> {
        const userId = localStorage.getItem(SESSION_KEY);
        if (!userId) return null;

        const profiles = await db.sql`SELECT * FROM profiles WHERE user_id = ${userId}`;
        if (profiles.length === 0) {
            this.logout();
            return null;
        }

        return this.mapProfile(profiles[0]);
    }

    logout() {
        localStorage.removeItem(SESSION_KEY);
    }

    private setSession(userId: string) {
        localStorage.setItem(SESSION_KEY, userId);
    }

    private mapProfile(raw: any): RegisteredPharmacy {
        return {
            ...raw,
            id: raw.user_id,
            is_active: !!raw.is_active
        } as any;
    }
}

export const authService = new AuthService();
