# Quick Start Guide

Get Documind up and running in 5 minutes!

## Step 1: Build the Extension (2 minutes)

```bash
# Clone the repository
git clone https://github.com/WangNatalie/documind.git
cd documind

# Install dependencies
npm install

# Build the extension
npm run build
```

You should see a `dist/` folder created with all the extension files.

## Step 2: Load in Chrome (1 minute)

1. Open Chrome and go to `chrome://extensions/`
2. Toggle "Developer mode" ON (top right corner)
3. Click "Load unpacked"
4. Navigate to and select the `dist/` folder
5. Documind should now appear in your extensions!

## Step 3: Enable PDF Access (30 seconds)

1. On the Documind card, click "Details"
2. Scroll to "Allow access to file URLs"
3. Toggle it ON

## Step 4: Test It! (1 minute)

1. Download a sample PDF or use your own
2. Open it in Chrome (drag & drop or File → Open)
3. The Documind viewer will automatically load!

### Try These Features:
- Click ☰ button on left to open the table of contents
- Use Previous/Next buttons to navigate
- Try arrow keys (← →) for keyboard navigation
- Click + and - buttons to zoom
- Navigate to a different page, close and reopen the PDF - it remembers!

## Optional: Configure APIs (if you want enhanced features)

1. Right-click the Documind extension icon
2. Select "Options"
3. Add your API keys:
   - **Chunkr.ai**: Get from https://chunkr.ai (for better chunking)
   - **Google Gemini**: Get from https://makersuite.google.com/app/apikey (for smarter TOC)
4. Click "Save Settings"

**Note**: Extension works perfectly without API keys using local fallbacks!

## What You Get

### Without API Keys (Fully Functional):
✅ PDF viewing with zoom and navigation
✅ Local paragraph-based chunking
✅ Basic table of contents
✅ Hash-based embeddings
✅ Last page memory
✅ Beautiful UI with sidebar

### With API Keys (Enhanced):
✅ Everything above, plus:
✅ Semantic chunking from Chunkr.ai
✅ AI-generated intelligent TOC from Gemini
✅ Better content organization

## Troubleshooting

### PDF doesn't open in custom viewer
- Make sure you enabled "Allow access to file URLs"
- Try reloading the extension
- Check browser console for errors (F12)

### Sidebar doesn't appear
- Look for the ☰ button on the left edge
- Try hovering near the left edge of the screen
- Click the ☰ button to toggle

### Table of Contents is empty
- This is normal for very short PDFs
- Processing may take 5-10 seconds for large PDFs
- Check browser console for progress messages

## Next Steps

- Read [FEATURES.md](FEATURES.md) for detailed feature list
- See [TESTING.md](TESTING.md) for testing guide
- Check [ARCHITECTURE.md](ARCHITECTURE.md) to understand how it works
- Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md)

## Key Files

```
📁 documind/
├── 📄 README.md           ← Project overview
├── 📄 QUICKSTART.md       ← This file!
├── 📄 INSTALLATION.md     ← Detailed setup
├── 📄 FEATURES.md         ← Feature documentation
├── 📄 TESTING.md          ← Testing guide
├── 📄 ARCHITECTURE.md     ← Technical details
├── 📁 src/                ← Source code
│   ├── viewer.ts          ← Main viewer logic
│   ├── db.ts              ← IndexedDB manager
│   └── services/          ← AI integrations
└── 📁 dist/               ← Built extension
```

## Tips

- **Keyboard shortcuts**: ← and → arrow keys for navigation
- **Zoom**: Use + and - buttons or browser zoom
- **Sidebar**: Hover on left edge to peek, click ☰ to pin
- **Performance**: First load processes PDF, subsequent loads are instant (cached)
- **Privacy**: All data stored locally in your browser

## Support

- 🐛 **Found a bug?** Open an issue on GitHub
- 💡 **Have an idea?** Create a feature request
- ❓ **Need help?** Check TESTING.md or open a discussion
- 🤝 **Want to contribute?** See CONTRIBUTING.md

---

**You're all set!** Enjoy your AI-powered PDF viewing experience! 🎉
