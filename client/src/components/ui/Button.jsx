export default function Button({
    children,
    onClick,
    disabled = false,
    variant = 'primary',
    type = 'button',
    className = '',
    loading = false,
}) {
    const base = 'w-full py-3 rounded-xl font-semibold text-lg transition-all duration-150 cursor-pointer select-none';

    const variants = {
        primary:
            'bg-amber text-white hover:bg-amber-dark active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed shadow-card',
        secondary:
            'bg-surface text-charcoal hover:bg-surface/80 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed',
        ghost:
            'bg-transparent text-charcoal/60 hover:text-charcoal active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed',
    };

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            className={`${base} ${variants[variant]} ${className}`}
        >
            {loading ? (
                <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {children}
                </span>
            ) : (
                children
            )}
        </button>
    );
}
