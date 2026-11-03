import { useCallback, useState } from 'react';

/**
 * Minimal form state helper.
 * const form = useForm({ name: '' }); <input {...form.field('name')} />
 */
export default function useForm(initialValues) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});

  const setValue = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const onChange = useCallback(
    (event) => {
      const { name, value, type, checked } = event.target;
      setValue(name, type === 'checkbox' ? checked : value);
    },
    [setValue]
  );

  const field = (name) => ({ name, value: values[name] ?? '', onChange, error: errors[name] });

  /** Applies server-side validation errors (422 details) to the form. */
  const applyServerErrors = (error) => setErrors(error?.fieldErrors || {});

  const reset = (next = initialValues) => {
    setValues(next);
    setErrors({});
  };

  return { values, setValues, setValue, onChange, field, errors, setErrors, applyServerErrors, reset };
}
