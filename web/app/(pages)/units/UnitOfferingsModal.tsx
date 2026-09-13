'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import styles from './page.module.css';

type UnitWithOfferings = {
    id?: string;
    unit_code: string;
    unit_name: string;
    offerings: number[];
};

type UnitOfferingsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    units: UnitWithOfferings[];
    onRefresh: () => Promise<void>;
};

const TERMS = [
    { id: 1, name: 'Semester 1', label: 'SEM 1' },
    { id: 2, name: 'Semester 2', label: 'SEM 2' },
    { id: 3, name: 'Summer Term', label: 'SUMMER' },
    { id: 4, name: 'Winter Term', label: 'WINTER' },
];

function formatOtherOfferings(offerings: number[], currentTermId: number): string {
    const otherTerms = offerings.filter((t) => t !== currentTermId);
    if (otherTerms.length === 0) return '-';
    const labelMap: Record<number, string> = {
        1: 'Sem 1',
        2: 'Sem 2',
        3: 'Summer',
        4: 'Winter',
    };
    return otherTerms
        .sort((a, b) => a - b)
        .map((t) => labelMap[t] || `Term ${t}`)
        .join(', ');
}

export default function UnitOfferingsModal({
    isOpen,
    onClose,
    units,
    onRefresh,
}: UnitOfferingsModalProps) {
    // Term active for adding: 1 | 2 | 3 | 4 | null
    const [activeAddTerm, setActiveAddTerm] = useState<number | null>(null);
    const [dropdownSearch, setDropdownSearch] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as HTMLElement;
            // Ignore if clicking the add/cancel button itself
            if (target.closest(`.${styles.addUnitInlineBtn}`)) {
                return;
            }

            if (dropdownRef.current && !dropdownRef.current.contains(target)) {
                setActiveAddTerm(null);
                setDropdownSearch('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Split units into terms and unclassified
    const { termUnitsMap, unclassifiedUnits } = useMemo(() => {
        const map: Record<number, UnitWithOfferings[]> = { 1: [], 2: [], 3: [], 4: [] };
        const unclassified: UnitWithOfferings[] = [];

        for (const unit of units) {
            if (!unit.offerings || unit.offerings.length === 0) {
                unclassified.push(unit);
            } else {
                unit.offerings.forEach((termId) => {
                    map[termId].push(unit);
                });
            }
        }

        // Sort alphabetically by unit code
        [1, 2, 3, 4].forEach((t) => map[t].sort((a, b) => a.unit_code.localeCompare(b.unit_code)));
        unclassified.sort((a, b) => a.unit_code.localeCompare(b.unit_code));

        return { termUnitsMap: map, unclassifiedUnits: unclassified };
    }, [units]);

    // Dropdown search results for active "+ Add Unit" term
    const dropdownResults = useMemo(() => {
        if (activeAddTerm === null) return [];
        const rawQuery = dropdownSearch.trim().toLowerCase();
        if (!rawQuery) {
            // Show recent/top units when input is empty
            return units.slice(0, 20);
        }

        // Split user query into keywords (e.g., "cos data" -> ["cos", "data"])
        const keywords = rawQuery.split(/\s+/).filter(Boolean);
        const normalizedQueryCode = rawQuery.replace(/[^a-z0-9]/g, '');

        return units.filter((u) => {
            const code = (u.unit_code || '').toLowerCase();
            const normalizedCode = code.replace(/[^a-z0-9]/g, '');
            const name = (u.unit_name || '').toLowerCase();
            const prereq = ((u as any).prerequisite || '').toLowerCase();

            // 1. Direct code match (handles "cos 10009" matching "COS10009")
            if (normalizedQueryCode && normalizedCode.includes(normalizedQueryCode)) {
                return true;
            }

            // 2. Multi-word search: all keywords must match either code, name, or prerequisite
            const allKeywordsMatch = keywords.every((kw) => 
                code.includes(kw) || name.includes(kw) || prereq.includes(kw)
            );

            return allKeywordsMatch;
        }).slice(0, 50);
    }, [units, dropdownSearch, activeAddTerm]);

    // API Call: Add Unit to Term
    const handleAddOffering = async (unit: UnitWithOfferings, term: number) => {
        if (!unit.id) return;
        setIsUpdating(true);
        try {
            const res = await fetch('/api/units/offerings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unit_id: unit.id, term }),
            });
            if (res.ok) {
                await onRefresh();
                setActiveAddTerm(null);
                setDropdownSearch('');
            }
        } catch (err) {
            console.error('Failed to add offering:', err);
        } finally {
            setIsUpdating(false);
        }
    };

    // API Call: Remove Unit from Term
    const handleRemoveOffering = async (unit: UnitWithOfferings, term: number) => {
        if (!unit.id) return;
        setIsUpdating(true);
        try {
            const res = await fetch('/api/units/offerings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unit_id: unit.id, term }),
            });
            if (res.ok) {
                await onRefresh();
            }
        } catch (err) {
            console.error('Failed to remove offering:', err);
        } finally {
            setIsUpdating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div
                className={`${styles.modalCard} ${styles.largeOfferingsModal}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className={styles.modalHeader}>
                <div>
                    <h3 className={styles.modalTitle}>Unit Offerings Manager</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Organize scheduled unit offerings across semesters and classify pending units.
                    </span>
                </div>
                <button className={styles.closeBtn} onClick={onClose}>
                    ✕
                </button>
                </div>

                {/* Modal Scrollable Content: 5 Stacked Tables */}
                <div className={styles.offeringsScrollBody}>

                {/* TABLES 1 to 4: ACTIVE TERMS */}

                {TERMS.map((term) => {
                    const list = termUnitsMap[term.id] || [];
                    const isAddingThisTerm = activeAddTerm === term.id;

                    return (
                        <div key={term.id} className={styles.termGroup}>
                            {/* Table Header Row */}
                            <div className={styles.termHeading}>
                            <span className={styles.termLabel}>{term.name} Offerings</span>
                            <span className={`${styles.badge} ${styles.badgeBlue}`}>{list.length}</span>
                            <div className={styles.termDivider} />
                            <button
                                className={styles.addUnitInlineBtn}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveAddTerm(isAddingThisTerm ? null : term.id);
                                    setDropdownSearch('');
                                }}
                            >
                                {isAddingThisTerm ? '✕ Cancel' : '+ Add Unit'}
                            </button>
                            </div>

                            {/* Inline Searchable Dropdown */}
                            {isAddingThisTerm && (
                            <div className={styles.dropdownContainer} ref={dropdownRef}>
                                <input
                                type="text"
                                autoFocus
                                placeholder={`Search unit code or name to add to ${term.name}...`}
                                className={styles.dropdownSearchInput}
                                value={dropdownSearch}
                                onChange={(e) => setDropdownSearch(e.target.value)}
                                />
                                <div className={styles.dropdownResultsList}>
                                {dropdownResults.length === 0 ? (
                                    <div className={styles.dropdownEmpty}>No matching units found.</div>
                                ) : (
                                    dropdownResults.map((u) => {
                                    const alreadyInThisTerm = u.offerings?.includes(term.id);
                                    const isUnclassified = !u.offerings || u.offerings.length === 0;

                                    return (
                                        <div
                                        key={u.unit_code}
                                        className={`${styles.dropdownItem} ${
                                            alreadyInThisTerm ? styles.dropdownItemDisabled : ''
                                        }`}
                                        onClick={() => {
                                            if (!alreadyInThisTerm) handleAddOffering(u, term.id);
                                        }}
                                        >
                                        <div className={styles.dropdownItemLeft}>
                                            <code className={styles.code}>{u.unit_code}</code>
                                            <span className={styles.dropdownItemTitle}>{u.unit_name}</span>
                                        </div>

                                        <div className={styles.dropdownItemRight}>
                                            {alreadyInThisTerm ? (
                                            <span className={`${styles.badge} ${styles.badgeBlue}`}>
                                                Already in {term.label}
                                            </span>
                                            ) : isUnclassified ? (
                                            <span className={`${styles.badge} ${styles.badgeOrange}`}>
                                                Unclassified
                                            </span>
                                            ) : (
                                            <span className={`${styles.badge} ${styles.badgeGreen}`}>
                                                Offered in: {formatOtherOfferings(u.offerings, 0)}
                                            </span>
                                            )}
                                        </div>
                                        </div>
                                    );
                                    })
                                )}
                                </div>
                            </div>
                            )}

                            {/* Term Table */}
                            <div className={styles.tableWrap}>
                                {list.length === 0 ? (
                                    <div className={styles.termEmpty}>No units scheduled in {term.name.toLowerCase()}.</div>
                                ) : (
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                            <th style={{ width: '16%' }}>UNIT CODE</th>
                                            <th style={{ width: '48%' }}>UNIT TITLE</th>
                                            <th style={{ width: '26%' }}>OTHER OFFERINGS</th>
                                            <th style={{ width: '10%', textAlign: 'center' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {list.map((unit) => (
                                            <tr key={unit.unit_code}>
                                                <td>
                                                <code className={styles.code}>{unit.unit_code}</code>
                                                </td>
                                                <td className={styles.unitNameText}>{unit.unit_name}</td>
                                                <td>
                                                <span className={styles.itemMeta}>
                                                    {formatOtherOfferings(unit.offerings, term.id)}
                                                </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                <button
                                                    className={styles.deleteBtn}
                                                    onClick={() => handleRemoveOffering(unit, term.id)}
                                                    disabled={isUpdating}
                                                    title={`Remove from ${term.name}`}
                                                >
                                                    DEL
                                                </button>
                                                </td>
                                            </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* ========================================================================================= */}
                {/* TABLE 5: UNCLASSIFIED UNITS */}
                {/* ========================================================================================= */}
                <div className={styles.termGroup}>
                    <div className={styles.termHeading}>
                    <span className={styles.termLabel}>Unclassified Units (No Semesters Assigned)</span>
                    <span className={`${styles.badge} ${styles.badgeOrange}`}>
                        {unclassifiedUnits.length}
                    </span>
                    <div className={styles.termDivider} />
                    </div>

                    <div className={styles.tableWrap}>
                        {unclassifiedUnits.length === 0 ? (
                            <div className={styles.termEmpty}>
                                All units are classified and scheduled into at least one semester.
                            </div>
                        ) : (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                    <th style={{ width: '16%' }}>UNIT CODE</th>
                                    <th style={{ width: '44%' }}>UNIT TITLE</th>
                                    <th style={{ width: '40%', textAlign: 'center' }}>QUICK ASSIGN TO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unclassifiedUnits.map((unit) => (
                                    <tr key={unit.unit_code}>
                                        <td>
                                        <code className={styles.code}>{unit.unit_code}</code>
                                        </td>
                                        <td className={styles.unitNameText}>{unit.unit_name}</td>
                                        <td style={{ textAlign: 'center' }}>
                                        <button
                                            className={styles.quickAssignBtn}
                                            onClick={() => handleAddOffering(unit, 1)}
                                            disabled={isUpdating}
                                        >
                                            + Sem 1
                                        </button>
                                        <button
                                            className={styles.quickAssignBtn}
                                            onClick={() => handleAddOffering(unit, 2)}
                                            disabled={isUpdating}
                                        >
                                            + Sem 2
                                        </button>
                                        <button
                                            className={styles.quickAssignBtn}
                                            onClick={() => handleAddOffering(unit, 3)}
                                            disabled={isUpdating}
                                        >
                                            + Summer
                                        </button>
                                        <button
                                            className={styles.quickAssignBtn}
                                            onClick={() => handleAddOffering(unit, 4)}
                                            disabled={isUpdating}
                                        >
                                            + Winter
                                        </button>
                                        </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
                </div>

                {/* Modal Footer */}
                <div className={styles.modalActions}>
                <button className={styles.btnSecondary} onClick={onClose}>
                    Done
                </button>
                </div>
            </div>
        </div>
    );
}
