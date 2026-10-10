import { createContext, useContext, useEffect, useState, type RefObject } from 'react';

/** Must be the observer's root: a scroll container in between would clip the rootMargin away. */
export const ScrollRootContext = createContext<Element | null>(null);

/** Becomes true once the element comes within `margin` of the scroll root, and stays true. */
export function useInView(ref: RefObject<Element | null>, margin = '200px'): boolean {
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  const root = useContext(ScrollRootContext);

  useEffect(() => {
    const element = ref.current;
    if (inView || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: margin },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, margin, inView, root]);

  return inView;
}
