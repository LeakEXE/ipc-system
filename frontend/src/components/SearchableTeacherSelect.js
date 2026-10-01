import Select from 'react-select';

// Searchable dropdown for guru/pegawai/pembina lists.
// Teachers prop: [{ id, nama, nip }]
// value: teacher id (string/number) or ''
// onChange: receives id as string ('' when cleared), mimics e.target.value
function SearchableTeacherSelect({
  value,
  teachers = [],
  onChange,
  placeholder = 'Cari nama guru...',
  isClearable = true,
  isDisabled = false,
  required = false,
  inputId,
}) {
  const options = (teachers || []).map((t) => ({
    value: String(t.id),
    label: t.nip ? `${t.nama} (${t.nip})` : t.nama,
  }));

  const selected =
    value === '' || value === null || value === undefined
      ? null
      : options.find((o) => o.value === String(value)) ||
        // Fallback: keep showing raw id if teacher list hasn't loaded yet
        null;

  return (
    <div style={{ position: 'relative' }}>
      <Select
        inputId={inputId}
        value={selected}
        onChange={(opt) => onChange && onChange(opt ? opt.value : '')}
        options={options}
        placeholder={placeholder}
        isSearchable
        isClearable={isClearable}
        isDisabled={isDisabled}
        noOptionsMessage={() => 'Tidak ditemukan'}
        styles={{
          control: (provided, state) => ({
            ...provided,
            minHeight: '40px',
            borderRadius: '4px',
            borderColor:
              required && !selected ? '#ef4444' : state.isFocused ? '#2684FF' : provided.borderColor,
            boxShadow: state.isFocused ? '0 0 0 1px #2684FF' : provided.boxShadow,
          }),
          menu: (provided) => ({ ...provided, zIndex: 1600 }),
        }}
      />
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={selected ? selected.value : ''}
          onChange={() => {}}
          required
          style={{
            opacity: 0,
            height: 0,
            width: '100%',
            position: 'absolute',
            bottom: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

export default SearchableTeacherSelect;
