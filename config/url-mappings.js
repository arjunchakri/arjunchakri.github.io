// URL Shortener Configuration
// Add your shortcut key to URL mappings here
// Usage: 
//   Direct path: yoursite.com/<shortcut>  (e.g., yoursite.com/linkedin)
//   Query param: yoursite.com?key=<shortcut>  (fallback method)

const urlMappings = {
    // Notion web links
    'dsa': 'https://arjunchakri.notion.site/Resources-18a85ef2a2298004b3f9d1156538e362',
    'dsapractice': 'https://arjunchakri.notion.site/Preps-24c85ef2a229806088bbf0c4643f50c2',

    // Social Media
    'linkedin': 'https://www.linkedin.com/in/arjunchakravarthy/',
    'li': 'https://www.linkedin.com/in/arjunchakravarthy/',

    // Resume/CV
    'resume': 'res/ArjunChakravarthyResume.pdf',
    'cv': 'res/ArjunChakravarthyResume.pdf',

    // GitHub
    'github': 'https://github.com/arjunchakri/arjunchakri.github.io',
    'gh': 'https://github.com/arjunchakri/arjunchakri.github.io',

    // Portfolio sections
    'portfolio': '#portfolio',
    'projects': '#projects',
    'contact': '#contact',
    'about': '#about',

    // Project shortcuts (examples - adjust based on your actual projects)
    'notes': 'notes/index.html',
    'polls': 'polls/index.html',
    'chat': 'test-chat/index.html',

    // External links (examples)
    'email': 'mailto:arjun@example.com',
    'twitter': 'https://twitter.com/arjunchakri',
    'instagram': 'https://instagram.com/arjunchakri',

    // Utility shortcuts
    'home': 'index.html',
    'main': 'index.html'
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = urlMappings;
}