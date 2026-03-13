import styles from './PlaceholderPanel.module.css';

interface InfoCard {
    icon: string;
    title: string;
    desc: string;
}

interface PlaceholderPanelProps {
    icon: string;
    title: string;
    description: string;
    panelId: string;
    features?: string[];
    cards?: InfoCard[];
    accentColor?: string;
}

export default function PlaceholderPanel({
    icon,
    title,
    description,
    panelId,
    features = [],
    cards = [],
    accentColor = 'var(--accent-blue)',
}: PlaceholderPanelProps) {
    return (
        <div className={styles.panel}>
            <div className={styles.sectionTitle}>{title}</div>

            {/* Main placeholder box */}
            <div
                className={styles.placeholderBox}
                style={{ '--accent-color': accentColor } as React.CSSProperties}
            >
                <div className={styles.placeholderIcon}>{icon}</div>
                <div className={styles.placeholderTitle}>{title}</div>
                <p className={styles.placeholderDesc}>{description}</p>

                {features.length > 0 && (
                    <div className={styles.featureList}>
                        {features.map((f) => (
                            <span key={f} className={styles.featureTag}>
                                {f}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Info cards */}
            {cards.length > 0 && (
                <>
                    <div className={styles.sectionTitle} style={{ marginTop: 24 }}>
                        Planned Features
                    </div>
                    <div className={styles.infoGrid}>
                        {cards.map((card) => (
                            <div key={card.title} className={styles.infoCard}>
                                <div className={styles.infoCardIcon}>{card.icon}</div>
                                <div className={styles.infoCardTitle}>{card.title}</div>
                                <div className={styles.infoCardDesc}>{card.desc}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}