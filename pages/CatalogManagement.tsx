import React, { useState, useMemo } from 'react';
import Card from '../components/Card';
import type { Category, SubCategory, Promotion, InventoryItem, RegisteredPharmacy } from '../types';
import AddCategoryModal from '../components/AddCategoryModal';
import AddSubCategoryModal from '../components/AddSubCategoryModal';
import AddPromotionModal from '../components/AddPromotionModal';

// Icons
const EditIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);
const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
);
const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m6 9 6 6 6-6"/></svg>
);


interface CatalogManagementProps {
    categories: Category[];
    subCategories: SubCategory[];
    promotions: Promotion[];
    medicines: InventoryItem[];
    onAddCategory: (data: Omit<Category, 'id'>) => void;
    onUpdateCategory: (updated: Category) => void;
    onDeleteCategory: (id: string) => void;
    onAddSubCategory: (data: Omit<SubCategory, 'id'>) => void;
    onUpdateSubCategory: (updated: SubCategory) => void;
    onDeleteSubCategory: (id: string) => void;
    onAddPromotion: (data: Omit<Promotion, 'id'>) => void;
    onUpdatePromotion: (updated: Promotion) => void;
    onDeletePromotion: (id: string) => void;
    currentUser: RegisteredPharmacy | null;
}

const CatalogManagement: React.FC<CatalogManagementProps> = ({
    categories, subCategories, promotions, medicines,
    onAddCategory, onUpdateCategory, onDeleteCategory,
    onAddSubCategory, onUpdateSubCategory, onDeleteSubCategory,
    onAddPromotion, onUpdatePromotion, onDeletePromotion,
    currentUser
}) => {
    // Modal State
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isSubCategoryModalOpen, setIsSubCategoryModalOpen] = useState(false);
    const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [editingSubCategory, setEditingSubCategory] = useState<SubCategory | null>(null);
    const [prefilledCategoryId, setPrefilledCategoryId] = useState<string | undefined>(undefined);
    const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
    
    // UI State
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

    const schemeProducts = useMemo(() => {
        return medicines.filter(item => 
            (item.deal && item.deal > 0) || 
            (item.free && item.free > 0) || 
            (item.purchaseDeal && item.purchaseDeal > 0) || 
            (item.purchaseFree && item.purchaseFree > 0)
        );
    }, [medicines]);

    const toggleCategory = (id: string) => {
        setExpandedCategories(prev => 
            prev.includes(id) ? prev.filter(catId => catId !== id) : [...prev, id]
        );
    };

    const openCategoryModal = (category: Category | null = null) => {
        setEditingCategory(category);
        setIsCategoryModalOpen(true);
    };

    const openSubCategoryModal = (subCategory: SubCategory | null = null, categoryId?: string) => {
        setEditingSubCategory(subCategory);
        setPrefilledCategoryId(categoryId);
        setIsSubCategoryModalOpen(true);
    };
    
    const openPromotionModal = (promotion: Promotion | null = null) => {
        setEditingPromotion(promotion);
        setIsPromotionModalOpen(true);
    };

    const StatusBadge: React.FC<{ isActive: boolean }> = ({ isActive }) => (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'}`}>
            {isActive ? 'Active' : 'Inactive'}
        </span>
    );
    
    return (
        <main className="flex-1 p-6 bg-app-bg overflow-y-auto page-fade-in">
            <h1 className="text-3xl font-bold text-app-text-primary">Catalog Management</h1>
            <p className="text-app-text-secondary mt-1">Manage product classifications, tags, and promotions in one place.</p>
            
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Categories & Sub-Categories */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-app-text-primary">Product Classification</h2>
                        <button onClick={() => openCategoryModal()} className="px-3 py-1.5 text-sm font-semibold text-primary-text bg-primary rounded-lg shadow-sm hover:bg-primary-dark">
                            + Add Category
                        </button>
                    </div>
                    <div className="space-y-3">
                      {categories.map(category => (
                        <div key={category.id} className="bg-card-bg border border-app-border rounded-lg transition-shadow hover:shadow-md">
                          <div className="p-3 flex justify-between items-center">
                            <div className="flex items-center space-x-3 flex-1 min-w-0" onClick={() => toggleCategory(category.id)} role="button" aria-expanded={expandedCategories.includes(category.id)}>
                                {category.imageUrl ? <img src={category.imageUrl} alt={category.name} className="w-10 h-10 rounded-md object-cover"/> : <div className="w-10 h-10 rounded-md bg-hover"></div>}
                                <div className="min-w-0">
                                    <h3 className="text-md font-bold text-app-text-primary truncate">{category.name}</h3>
                                    <StatusBadge isActive={category.is_active} />
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                <button onClick={() => openCategoryModal(category)} className="p-1.5 text-app-text-secondary hover:text-app-text-primary rounded-full hover:bg-hover"><EditIcon /></button>
                                <button onClick={() => toggleCategory(category.id)} className="p-1.5 text-app-text-secondary hover:text-app-text-primary rounded-full hover:bg-hover">
                                    <ChevronDownIcon className={`transition-transform ${expandedCategories.includes(category.id) ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                          </div>
                          {expandedCategories.includes(category.id) && (
                            <div className="border-t border-app-border bg-hover/50 pb-2">
                                {subCategories.filter(sub => sub.categoryId === category.id).map(sub => (
                                    <div key={sub.id} className="pl-8 pr-4 py-2 flex justify-between items-center hover:bg-hover">
                                        <div className="flex items-center space-x-3">
                                            {sub.imageUrl ? <img src={sub.imageUrl} alt={sub.name} className="w-8 h-8 rounded object-cover"/> : <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-600"></div>}
                                            <div>
                                               <p className="text-app-text-primary text-sm font-medium">{sub.name}</p>
                                               <StatusBadge isActive={sub.is_active} />
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button onClick={() => openSubCategoryModal(sub)} className="p-1.5 text-app-text-secondary hover:text-app-text-primary rounded-full hover:bg-hover"><EditIcon /></button>
                                            <button onClick={() => onDeleteSubCategory(sub.id)} className="p-1.5 text-app-text-secondary hover:text-red-600 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon/></button>
                                        </div>
                                    </div>
                                ))}
                                <div className="pl-8 pr-4 pt-2">
                                    <button onClick={() => openSubCategoryModal(null, category.id)} className="text-sm font-medium text-primary hover:text-primary-dark">+ Add Sub-category</button>
                                </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                </div>

                {/* Right Column: Promotions & Schemes */}
                <div className="lg:col-span-2 space-y-8">
                    <div>
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-app-text-primary">Tags & Promotions</h2>
                            <button onClick={() => openPromotionModal()} className="px-3 py-1.5 text-sm font-semibold text-primary-text bg-primary rounded-lg shadow-sm hover:bg-primary-dark">
                                + Add Tag
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            {promotions.map(promo => {
                                const discount = promo.discountType === 'flat' ? `₹${promo.discountValue} Flat` : `${promo.discountValue}%`;
                                const validity = `${new Date(promo.startDate).toLocaleDateString('en-GB')} - ${new Date(promo.endDate).toLocaleDateString('en-GB')}`;
                                return (
                                    <Card key={promo.id} className="p-4 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h3 className="text-md font-bold text-app-text-primary">{promo.name}</h3>
                                                <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium capitalize ${promo.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-hover text-app-text-primary dark:bg-gray-700 dark:text-gray-200'}`}>{promo.status}</span>
                                            </div>
                                            <p className="text-sm text-app-text-secondary mt-1">{promo.description}</p>
                                            <div className="mt-3 text-sm space-y-1">
                                                <p><span className="font-semibold text-indigo-600 dark:text-indigo-400">{discount} OFF</span></p>
                                                <p className="text-app-text-secondary"><strong>Active:</strong> {validity}</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-app-border flex justify-end items-center space-x-2">
                                            <button onClick={() => openPromotionModal(promo)} className="p-1.5 text-app-text-secondary hover:text-app-text-primary rounded-full hover:bg-hover"><EditIcon /></button>
                                            <button onClick={() => onDeletePromotion(promo.id)} className="p-1.5 text-app-text-secondary hover:text-red-600 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon /></button>
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold text-app-text-primary">Scheme Products</h2>
                        <Card className="mt-4 p-0">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-app-border">
                                    <thead className="bg-hover">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-app-text-secondary uppercase">Product</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-app-text-secondary uppercase">Batch / Expiry</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-app-text-secondary uppercase">Stock</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-app-text-secondary uppercase">Purchase Scheme</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-app-text-secondary uppercase">Sale Scheme</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-card-bg divide-y divide-app-border">
                                        {schemeProducts.length > 0 ? (
                                            schemeProducts.map(item => {
                                                const purchaseScheme =
                                                    (item.purchaseDeal || 0) > 0
                                                        ? `${item.purchaseDeal}+${item.purchaseFree || 0}`
                                                        : (item.purchaseFree || 0) > 0
                                                        ? `+${item.purchaseFree}`
                                                        : '—';

                                                const saleScheme =
                                                    (item.deal || 0) > 0
                                                        ? `${item.deal}+${item.free || 0}`
                                                        : (item.free || 0) > 0
                                                        ? `+${item.free}`
                                                        : '—';

                                                return (
                                                    <tr key={item.id}>
                                                        <td className="px-4 py-4 font-medium text-app-text-primary">{item.name} <span className="block text-xs text-app-text-tertiary">{item.brand}</span></td>
                                                        <td className="px-4 py-4 text-sm text-app-text-secondary">{item.batch}<span className="block text-xs">{item.expiry}</span></td>
                                                        <td className="px-4 py-4 text-sm text-right text-app-text-primary font-semibold">{item.stock}</td>
                                                        <td className="px-4 py-4 text-sm text-blue-600 font-medium text-center">
                                                            {purchaseScheme}
                                                        </td>
                                                        <td className="px-4 py-4 text-sm text-green-600 font-medium text-center">
                                                            {saleScheme}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-app-text-secondary">
                                                    No scheme products found in inventory.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            <AddCategoryModal 
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                onSave={(data: any) => {
                    if (data.id) onUpdateCategory(data);
                    else onAddCategory(data);
                }}
                category={editingCategory}
                currentUser={currentUser}
            />

            <AddSubCategoryModal
                isOpen={isSubCategoryModalOpen}
                onClose={() => { setIsSubCategoryModalOpen(false); setPrefilledCategoryId(undefined); }}
                onSave={(data: any) => {
                    if (data.id) onUpdateSubCategory(data);
                    else onAddSubCategory(data);
                }}
                subCategory={editingSubCategory}
                categories={categories}
                prefilledCategoryId={prefilledCategoryId}
                currentUser={currentUser}
            />
            
            <AddPromotionModal 
                isOpen={isPromotionModalOpen}
                onClose={() => setIsPromotionModalOpen(false)}
                onSave={(data: any) => {
                    if (data.id) onUpdatePromotion(data);
                    else onAddPromotion(data);
                }}
                promotion={editingPromotion}
                categories={categories}
                subCategories={subCategories}
                medicines={medicines}
                currentUser={currentUser}
            />
        </main>
    );
};

export default CatalogManagement;