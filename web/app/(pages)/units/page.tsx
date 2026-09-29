'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import UnitOfferingsModal from './UnitOfferingsModal';


// ==================================================================================================================
// Utility Functions
// ==================================================================================================================

type UnitData = {
    id?: string;
    unit_code: string;
    unit_name: string;
    offerings: number[];
    prerequisite?: string; 
};

function formatOfferings(offered_in: any): string {
    if (!offered_in) return '-';
    if (Array.isArray(offered_in)) {
        if (offered_in.length === 0) return '-';
        return offered_in
            .slice()
            .sort((a, b) => a - b)
            .map((term: number) => {
                if (term === 1) return 'Sem 1';
                if (term === 2) return 'Sem 2';
                if (term === 3) return 'Summer';
                if (term === 4) return 'Winter';
                return `Term ${term}`;
        })
        .join(', ');
    }
    if (offered_in === 1) return 'Sem 1';
    if (offered_in === 2) return 'Sem 2';
    if (offered_in === 3) return 'Summer';
    if (offered_in === 4) return 'Winter';
    return String(offered_in);
}

export default function UnitsPage() {
    // ==================================================================================================================
    // STATE HOOKS
    // ==================================================================================================================
    const [units, setUnits] = useState<UnitData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Add / Edit Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUnit, setEditingUnit] = useState<UnitData | null>(null);
    const [formCode, setFormCode] = useState('');
    const [formName, setFormName] = useState('');
    const [formOfferings, setFormOfferings] = useState<number[]>([]);
    const [formPrereq, setFormPrereq] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const [isOfferingsModalOpen, setIsOfferingsModalOpen] = useState(false);

    // ==================================================================================================================
    // useMemo (derived data)
    // ==================================================================================================================
    // Filter by query and group by the first 3 letters of the unit code (e.g. COS, SWE, MPU)
    const groupedUnits = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();

        const filtered = units.filter(
            (u) =>
                u.unit_code.toLowerCase().includes(q) ||
                u.unit_name.toLowerCase().includes(q)
        );

        const groups: Record<string, UnitData[]> = {};

        for (const u of filtered) {
            const match = u.unit_code.match(/^[A-Za-z]{3}/);
            const prefix = match ? match[0].toUpperCase() : 'OTHER';

            if (!groups[prefix]) groups[prefix] = [];
            groups[prefix].push(u);
        }

        // Sort units within each group alphabetically by code
        for (const prefix of Object.keys(groups)) {
            groups[prefix].sort((a, b) => a.unit_code.localeCompare(b.unit_code));
        }

        // Sort prefix headers alphabetically
        return Object.keys(groups)
        .sort()
        .reduce((acc, key) => {
            acc[key] = groups[key];
            return acc;
        }, {} as Record<string, UnitData[]>);
    }, [units, searchQuery]);

    const totalMatchingUnits = useMemo(() => {
        return Object.values(groupedUnits).reduce((sum, list) => sum + list.length, 0);
    }, [groupedUnits]);

    // ==================================================================================================================
    // EVENT HANDLERS & HELPER FUNCTIONS
    // ==================================================================================================================
    const handleOpenAdd = () => {
        setEditingUnit(null);
        setFormCode('');
        setFormName('');
        setFormPrereq('');
        setFormOfferings([1, 2]); // default to Sem 1 & Sem 2
        setFormError('');
        setIsModalOpen(true);
    };

    const handleOpenEdit = (unit: UnitData) => {
        setEditingUnit(unit);
        setFormCode(unit.unit_code);
        setFormName(unit.unit_name);
        setFormPrereq(unit.prerequisite || '');
        setFormOfferings(unit.offerings || []);
        setFormError('');
        setIsModalOpen(true);
    };

    const handleToggleOffering = (term: number) => {
        setFormOfferings((prev) =>
            prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term].sort((a, b) => a - b)
        );
    };

    const handleSaveUnit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formCode.trim()) {
            setFormError('Unit code is required.');
            return;
        }
        if (!formName.trim()) {
            setFormError('Unit name is required.');
            return;
        }

        setIsSaving(true);
        setFormError('');

        try {
            const res = await fetch('/api/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unit_code: formCode.trim().toUpperCase(),
                    unit_name: formName.trim(),
                    offerings: formOfferings,
                    prerequisite: formPrereq.trim(), 
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to save unit.');
            }

            setIsModalOpen(false);
            await fetchAllUnits();
        } catch (err: any) {
            setFormError(err.message || 'Error saving unit.');
        } finally {
            setIsSaving(false);
        }
    };

    const fetchAllUnits = async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/units', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setUnits(data);
            }
        } catch (err) {
            console.error('Failed to fetch units:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // ==================================================================================================================
    // useEffect HOOKS
    // ==================================================================================================================
    useEffect(() => {
        fetchAllUnits();
    }, []);

    // ==================================================================================================================
    // RETURN (JSX)
    // ==================================================================================================================
    return (
        <div className={styles.layout}>
            {/* Top Bar with Search & Navigation */}
            <div className={styles.topBar}>
                <div className={styles.searchGroup}>
                    <input
                        type="text"
                        placeholder="🔍 Filter unit code or title..."
                        className={styles.searchInput}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button className={styles.btnSecondary} onClick={() => setIsOfferingsModalOpen(true)}>
                        Unit Offerings
                    </button>
                    <button className={styles.btnPrimary} onClick={handleOpenAdd}>
                        + Add Unit
                    </button>
                    <Link href="/planners">
                        <button className={styles.btnSecondary}>View Planners</button>
                    </Link>
                </div>
            </div>

            {/* Main Content Area */}
            <div className={styles.contentArea}>
                <div className={styles.sectionTitle}>Master Units Catalogue</div>

                {isLoading ? (
                    <div className={styles.termEmpty}>Loading units catalogue...</div>
                ) : totalMatchingUnits === 0 ? (
                    <div className={styles.termEmpty}>
                        {searchQuery ? `No units match "${searchQuery}".` : 'No units in catalog.'}
                    </div>
                ) : (
                    Object.entries(groupedUnits).map(([prefix, unitList]) => (
                        <div key={prefix} className={styles.termGroup}>
                            {/* Group Header (e.g. "COS UNITS — 24 UNITS") */}
                            <div className={styles.termHeading}>
                                <span className={styles.termLabel}>{prefix} Units</span>
                                <span className={`${styles.badge} ${styles.badgeBlue}`}>{unitList.length}</span>
                                <div className={styles.termDivider} />
                            </div>

                            {/* Units Table */}
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '14%' }}>UNIT CODE</th>
                                            <th style={{ width: '40%' }}>UNIT TITLE</th>
                                            <th style={{ width: '22%' }}>PREREQUISITE</th>
                                            <th style={{ width: '14%' }}>OFFERED IN</th>
                                            <th style={{ width: '10%', textAlign: 'center' }}>ACTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {unitList.map((unit) => (
                                        <tr key={unit.unit_code}>
                                            <td>
                                                <code className={styles.code}>{unit.unit_code}</code>
                                            </td>
                                            <td className={styles.unitNameText}>{unit.unit_name}</td>
                                            <td>
                                                <span className={styles.itemMeta}>
                                                    {unit.prerequisite || <span className={styles.textMuted}>-</span>}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.badge} ${unit.offerings?.length ? styles.badgeGreen : styles.badgeOrange}`}>
                                                    {formatOfferings(unit.offerings)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button className={styles.editBtn} onClick={() => handleOpenEdit(unit)}>
                                                Edit
                                                </button>
                                            </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add / Edit Pop-up Modal */}
            {isModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>
                                {editingUnit ? `Edit Unit: ${editingUnit.unit_code}` : 'Add New Unit'}
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveUnit}>
                            {formError && <div className={styles.errorAlert}>{formError}</div>}

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Unit Code</label>
                                <input
                                type="text"
                                placeholder="e.g. COS20007"
                                className={styles.formInput}
                                value={formCode}
                                onChange={(e) => setFormCode(e.target.value)}
                                disabled={Boolean(editingUnit)}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Unit Title</label>
                                <input
                                type="text"
                                placeholder="e.g. Object-Oriented Programming"
                                className={styles.formInput}
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Prerequisite</label>
                                <input
                                    type="text"
                                    placeholder="e.g. COS10009 & COS10004 / 50cp"
                                    className={styles.formInput}
                                    value={formPrereq}
                                    onChange={(e) => setFormPrereq(e.target.value)}
                                />
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                    Use '&' for AND, '/' for OR (e.g. COS10009 / COS10022). Credit points: 50cp
                                </span>
                                </div>


                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Offering Semesters / Terms</label>
                                <div className={styles.checkboxGrid}>
                                    {[
                                        { id: 1, label: 'Semester 1' },
                                        { id: 2, label: 'Semester 2' },
                                        { id: 3, label: 'Summer Term' },
                                        { id: 4, label: 'Winter Term' },
                                    ].map((term) => (
                                        <label key={term.id} className={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={formOfferings.includes(term.id)}
                                                onChange={() => handleToggleOffering(term.id)}
                                            />
                                            <span>{term.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={isSaving}
                                    >
                                    Cancel
                                </button>
                                <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
                                    {isSaving ? 'Saving...' : 'Save Unit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <UnitOfferingsModal
                isOpen={isOfferingsModalOpen}
                onClose={() => setIsOfferingsModalOpen(false)}
                units={units}
                onRefresh={fetchAllUnits}
            />
        </div>
    );
}
