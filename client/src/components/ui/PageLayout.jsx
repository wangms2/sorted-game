export default function PageLayout({ children, className = '' }) {
    return (
        <div className={`min-h-screen bg-cream flex items-center justify-center p-4 ${className}`}>
            {children}
        </div>
    );
}
