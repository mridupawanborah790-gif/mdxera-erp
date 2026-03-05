import { supabase } from './supabaseClient';
import type { Supplier, RegisteredPharmacy } from '../types';
import { parseNetworkAndApiError } from '../utils/error';
import { generateUUID } from './storageService';

export type SupplierSaveStatus = 'created' | 'updated' | 'duplicate';

export interface SupplierQuickResult {
    status: SupplierSaveStatus;
    supplier: Supplier;
    message: string;
}

type SupplierPayload = Partial<Supplier> & { id?: string; name: string };

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();
const normalizeAlphaNum = (value?: string | null) => (value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

export const findDuplicateSupplier = (suppliers: Supplier[], payload: SupplierPayload): Supplier | null => {
    const name = normalize(payload.name);
    const gst = normalizeAlphaNum(payload.gst_number);
    const phone = normalize(payload.phone || payload.mobile);
    const currentId = payload.id || '';

    return suppliers.find((candidate) => {
        if (!candidate || candidate.id === currentId) return false;
        const sameName = !!name && normalize(candidate.name) === name;
        const sameGst = !!gst && normalizeAlphaNum(candidate.gst_number) === gst;
        const candidatePhone = normalize(candidate.phone || candidate.mobile);
        const samePhone = !!phone && candidatePhone === phone;
        return sameName || sameGst || samePhone;
    }) || null;
};

export const createSupplierQuick = async (
    organizationId: string,
    supplierPayload: SupplierPayload,
    context: {
        currentUser: RegisteredPharmacy;
        existingSuppliers?: Supplier[];
        defaultControlGlId?: string;
    }
): Promise<SupplierQuickResult> => {
    if (!organizationId) throw new Error('Organization is required to create supplier.');
    const name = (supplierPayload.name || '').trim();
    if (!name) throw new Error('Supplier Name is required.');

    const duplicate = findDuplicateSupplier(context.existingSuppliers || [], supplierPayload);
    if (duplicate) {
        return { status: 'duplicate', supplier: duplicate, message: 'Supplier already exists' };
    }

    const now = new Date().toISOString();
    const payload: any = {
        ...supplierPayload,
        id: supplierPayload.id || generateUUID(),
        organization_id: organizationId,
        user_id: context.currentUser.user_id || context.currentUser.id,
        name,
        supplier_group: supplierPayload.supplier_group || 'Sundry Creditors',
        control_gl_id: supplierPayload.control_gl_id || context.defaultControlGlId || '',
        updated_at: now,
    };

    if (!supplierPayload.id) payload.created_at = now;

    const { data, error } = await supabase
        .from('suppliers')
        .upsert(payload)
        .select('*')
        .single();

    if (error) {
        throw new Error(parseNetworkAndApiError(error));
    }

    const saved = data as Supplier;
    return {
        status: supplierPayload.id ? 'updated' : 'created',
        supplier: saved,
        message: supplierPayload.id ? 'Updated Successfully' : 'Saved Successfully',
    };
};
