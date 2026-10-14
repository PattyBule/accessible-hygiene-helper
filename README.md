# Accessible Hygiene Helper

A lightweight, privacy-first Web/H5 visual helper for checking whether a surface or wipe appears to have blood, yellow staining, or brown/possible fecal staining. The app runs locally in the browser and uses the device camera for image analysis without uploading photos.

## Features
- Camera-based detection for a central ROI (region of interest)
- White-card calibration to improve accuracy under changing lighting
- Detects likely red blood-like staining, yellow stains, and brown/possible fecal staining
- Voice output using the browser speech API for accessibility
- Local storage export and save for privacy-focused workflow
- Mobile-friendly responsive design and PWA support

## Deploy

You can use any static hosting provider such as GitHub Pages, Netlify, or Vercel.

### Local preview

```bash
python -m http.server 8000
```

Then open http://localhost:8000 in the browser.

## Accessibility notes
- The interface is designed for keyboard and screen-reader use with `aria-live` and semantic headings.
- For best results, use strong lighting and aim the target area inside the dashed box.
- This tool is an aid, not a medical diagnosis.

## License
MIT
