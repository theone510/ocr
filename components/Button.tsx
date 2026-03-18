
import React from 'react';

// Define the available size options for the button
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  isLoading, 
  icon, 
  className = '', 
  disabled,
  ...props 
}) => {
  // Core styling shared by all button variants
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 active:scale-95";
  
  const variants = {
    // Luxury Gold Gradient
    primary: "bg-gradient-to-r from-[#c5a059] to-[#9f7d3d] text-slate-900 hover:shadow-[0_0_15px_rgba(197,160,89,0.3)] border border-[#c5a059]/50",
    // Deep Teal/Emerald
    secondary: "bg-slate-800 text-[#c5a059] border border-[#c5a059]/30 hover:bg-[#c5a059]/10 hover:border-[#c5a059]",
    // Glassy Outline
    outline: "border border-slate-600 bg-transparent text-slate-300 hover:border-white hover:text-white hover:bg-white/5",
    // Ghost
    ghost: "text-slate-400 hover:text-white hover:bg-white/5",
  };

  // Sizing utilities for consistent UI scaling
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-3.5 text-base",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : icon ? (
        <span className="mr-2">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};
