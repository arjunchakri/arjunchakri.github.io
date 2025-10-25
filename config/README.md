# URL Shortener Feature

This website now includes a URL shortener feature that allows you to create short links using query parameters.

## How to Use

### Basic Usage
Use direct paths or query parameters to redirect to configured destinations.

### **Direct Path (Preferred):**
- `yoursite.com/linkedin` → Redirects to LinkedIn profile
- `yoursite.com/resume` → Redirects to resume PDF  
- `yoursite.com/github` → Redirects to GitHub profile
- ✅ **Now works on GitHub Pages** (via 404.html redirect)

**Query Parameter (Fallback):**
- `yoursite.com?key=linkedin` → Also works for compatibility
- `yoursite.com?key=resume` → Fallback method
- `yoursite.com?key=github` → Alternative approach

### Available Shortcuts

The following shortcuts are pre-configured:

#### Social Media
- `linkedin` or `li` → LinkedIn profile
- `github` or `gh` → GitHub profile  
- `twitter` → Twitter profile
- `instagram` → Instagram profile

#### Documents
- `resume` or `cv` → Resume/CV PDF

#### Portfolio Sections
- `portfolio` → Portfolio section
- `projects` → Projects section
- `contact` → Contact section
- `about` → About section

#### Project Pages
- `notes` → Notes application
- `polls` → Polls application
- `chat` → Chat application

#### Utility
- `home` or `main` → Homepage
- `email` → Email contact

## Configuration

### Adding New Shortcuts

1. Open `config/url-mappings.js`
2. Add your new mapping to the `urlMappings` object:

```javascript
const urlMappings = {
    // Existing mappings...
    'newkey': 'https://example.com',
    'internal': 'path/to/page.html',
    'anchor': '#section-name'
};
```

### URL Types Supported

- **External URLs**: Full HTTP/HTTPS URLs (e.g., `https://github.com`)
- **Relative URLs**: Local files (e.g., `notes/index.html`)
- **Anchors**: Page sections (e.g., `#contact`)
- **Email**: Mailto links (e.g., `mailto:name@example.com`)

## Technical Details

### Files Created/Modified

1. **`config/url-mappings.js`** - Configuration file with key-to-URL mappings
2. **`js/url-shortener.js`** - Main functionality script
3. **`index.html`** - Modified to include the new scripts

### Features

- **Case Insensitive**: Keys work regardless of case
- **User Feedback**: Shows loading messages and error handling
- **Fallback**: Redirects to homepage for invalid keys
- **Debug Support**: Use `showAvailableKeys()` in browser console

### Error Handling

- Invalid keys show a "Key Not Found" message
- Automatic redirect to homepage after 3 seconds for invalid keys
- Loading animation for valid redirects

## Examples

### Direct Path Method (Recommended)
```
# Social media shortcuts
yoursite.com/linkedin
yoursite.com/li
yoursite.com/github  
yoursite.com/gh

# Document shortcuts
yoursite.com/resume
yoursite.com/cv

# Project shortcuts
yoursite.com/notes
yoursite.com/polls

# External services
yoursite.com/email
```

### Query Parameter Method (Fallback)
```
# Still supported for compatibility
yoursite.com?key=linkedin
yoursite.com?key=resume
yoursite.com?key=github
```

## GitHub Pages Compatibility

⚠️ **Important for GitHub Pages Users**

GitHub Pages doesn't support server-side redirects, so direct paths like `yoursite.com/linkedin` will show a 404 error.

### **Recommended Solutions:**

#### Option 1: Use Query Parameters (Simplest)
Stick with the query parameter method:
- `yoursite.com?key=linkedin` ✅ Works on GitHub Pages
- `yoursite.com?key=resume` ✅ Works on GitHub Pages

#### Option 2: 404 Redirect Workaround
Create a `404.html` file to handle missing paths:

```html
<!DOCTYPE html>
<html>
<head>
    <script>
        // Extract path and redirect to index.html with query param
        const path = window.location.pathname.substring(1);
        if (path) {
            window.location.href = '/index.html?key=' + path;
        } else {
            window.location.href = '/index.html';
        }
    </script>
</head>
<body>
    <p>Redirecting...</p>
</body>
</html>
```

With this workaround:
- `yoursite.com/linkedin` → Redirects to `yoursite.com/index.html?key=linkedin`
- Both methods work seamlessly

### **Other Hosting Platforms**

- **Netlify/Vercel**: Support client-side routing with proper `_redirects` configuration
- **Apache**: Use `.htaccess` rewrite rules
- **Nginx**: Configure `try_files` directive

## Maintenance

To update or add new shortcuts:

1. Edit `config/url-mappings.js`
2. Add new entries to the `urlMappings` object
3. Save the file - changes take effect immediately

No server restart required since this is a static implementation using client-side JavaScript.