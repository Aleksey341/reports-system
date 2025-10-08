export default function Button({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}) {
  const variants = {
    primary: 'btn',
    secondary: 'btn btn-secondary',
    danger: 'btn btn-danger',
    ghost: 'btn btn-ghost'
  };

  const sizes = {
    small: 'btn-sm',
    medium: '',
    large: 'btn-lg'
  };

  return (
    <button
      type={type}
      className={`${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <span className="spinner-small" style={{ marginRight: '8px' }}></span>}
      {children}
    </button>
  );
}
