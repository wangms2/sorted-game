export default function Card({ children, className = '', padded = true }) {
    return (
        <div
            className={`bg-card border-4 border-charcoal rounded-xl shadow-card ${padded ? 'p-6' : ''} ${className}`}
        >
            {children}
        </div>
    );
}
