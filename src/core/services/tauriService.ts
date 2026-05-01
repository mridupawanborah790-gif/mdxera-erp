import { invoke } from '@tauri-apps/api/core';

export async function parseDbf(filePath: string): Promise<any[]> {
    try {
        const result = await invoke<any[]>('parse_dbf', { path: filePath });
        return result;
    } catch (error) {
        console.error('Error calling parse_dbf:', error);
        throw error;
    }
}
