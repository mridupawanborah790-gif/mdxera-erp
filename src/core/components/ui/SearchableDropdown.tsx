import React, { useState, useRef, useEffect } from 'react';

interface Option {
    id: string;
    name: string;
}

interface SearchableDropdownProps {
    options: Option[];
    value: string;
    onChange: (value: string, id?: string) => void;
    placeholder?: string;
    disabled?: boolean;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    className?: string;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
    options,
    value,
    onChange,
    placeholder,
    disabled,
    onKeyDown,
    className = "w-full h-8 border border-gray-400 p-1 text-xs font-bold outline-none uppercase focus:bg-yellow-50"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(value);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    const filteredOptions = options.filter(opt =>
        (opt.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (opt: Option) => {
        onChange(opt.name, opt.id);
        setSearchTerm(opt.name);
        setIsOpen(false);
        setHighlightedIndex(-1);
    };

    const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(prev => (prev + 1) % Math.max(filteredOptions.length, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % Math.max(filteredOptions.length, 1));
        } else if (e.key === 'Enter') {
            if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(filteredOptions[highlightedIndex]);
                return;
            }
            // If not selecting from dropdown, let the parent handle Enter
            setIsOpen(false);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }

        if (onKeyDown) {
            onKeyDown(e);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    onChange(e.target.value);
                    setIsOpen(true);
                    setHighlightedIndex(0);
                }}
                onFocus={() => {
                    setIsOpen(true);
                    setHighlightedIndex(0);
                }}
                onKeyDown={handleInternalKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                autoComplete="off"
            />
            {isOpen && !disabled && (
                <div className="absolute z-[100] w-full mt-0 bg-white border border-gray-400 shadow-xl max-h-60 overflow-y-auto">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt, index) => (
                            <div
                                key={opt.id}
                                className={`p-2 text-[10px] font-bold uppercase cursor-pointer transition-colors ${
                                    index === highlightedIndex ? 'bg-primary text-white' : 'hover:bg-primary hover:text-white'
                                }`}
                                onClick={() => handleSelect(opt)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {opt.name}
                            </div>
                        ))
                    ) : (
                        <div className="p-2 text-[10px] font-bold text-gray-400 uppercase italic bg-gray-50">
                            No matches found
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown;
