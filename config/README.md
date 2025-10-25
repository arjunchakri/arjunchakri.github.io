# URL Shortener Feature

This website now includes a powerful URL shortener feature with Firebase backend for dynamic management of short links.

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

**Option 1: Static Config (Fast, requires file edit)**
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

**Option 2: Dynamic Admin (Easy, real-time)**
1. Visit `/config/admin.html`
2. Use the admin interface to add shortcuts instantly
3. No file editing required!

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

## Firebase Management

### **Admin Interface**

Access the admin interface at `/config/admin.html` to:

- ✅ **Add new shortcuts** dynamically
- ✅ **Edit existing shortcuts** 
- ✅ **Delete shortcuts** you no longer need
- ✅ **View usage statistics** for each shortcut
- ✅ **Test shortcuts** before sharing
- ✅ **Real-time updates** via Firebase

### **Migration from Static Config**

If you're upgrading from the static configuration:

1. Visit `/config/migrate.html`
2. Click "Start Migration" to transfer static mappings to Firebase
3. All existing shortcuts will be preserved
4. Future management will be done via the admin interface

### **Features**

- **Hybrid Storage**: Static mappings for speed + Firebase for dynamic management
- **Performance Optimized**: Checks static config first, Firebase as fallback
- **Real-time Management**: Add, edit, delete shortcuts instantly via admin
- **Usage Tracking**: See how many times each shortcut is used
- **Statistics Dashboard**: Overview of total shortcuts and usage
- **Intelligent Caching**: Firebase mappings cached locally after first lookup
- **Mobile Friendly**: Admin interface works on all devices
- **Backup & Sync**: Your shortcuts are safely stored in Firebase

### **How the Hybrid System Works**

The URL shortener uses a **two-tier lookup system** for optimal performance:

1. **🏃‍♂️ Static First**: Checks `url-mappings.js` first (instant, no network)
2. **☁️ Firebase Fallback**: If not found, queries Firebase database
3. **💾 Smart Caching**: Firebase results cached locally for future speed

**Benefits:**
- ⚡ **Lightning Fast**: Static mappings load instantly
- 🔄 **Always Current**: Dynamic mappings via Firebase stay up-to-date  
- 📊 **Full Analytics**: Usage tracking for all shortcuts
- 🛡️ **Reliable**: Falls back gracefully if Firebase is unavailable

**Example Flow:**
```
User visits: yoursite.com/linkedin
1. ✅ Check static config → Found! Redirect immediately
2. ❌ Not in static → Check Firebase → Found! Cache & redirect
3. ❌ Not anywhere → Show "not found" message
```

### **Database Structure**

Firebase stores data in this structure:
```
urlShortener/
  mappings/
    linkedin: { url: "https://linkedin.com/in/...", createdAt: timestamp }
    resume: { url: "res/resume.pdf", updatedAt: timestamp }
  stats/
    linkedin: { count: 45, firstUsed: timestamp, lastUsed: timestamp }
```