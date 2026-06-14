interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-300 mb-1"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full px-3 py-2 bg-gray-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-white ${
          error ? 'border-red-500' : 'border-gray-700'
        } ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
