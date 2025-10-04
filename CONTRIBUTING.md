# Contributing to Documind

Thank you for your interest in contributing to Documind! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites
- Node.js v18 or higher
- npm
- Git
- Google Chrome browser

### Setup Development Environment
1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/documind.git
   cd documind
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the extension:
   ```bash
   npm run build
   ```
5. Load the extension in Chrome (see INSTALLATION.md)

### Development Workflow
1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Test thoroughly (see TESTING.md)
4. Build the extension:
   ```bash
   npm run build
   ```
5. Commit your changes:
   ```bash
   git commit -m "Description of changes"
   ```
6. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. Open a Pull Request

## Code Style

### TypeScript
- Use TypeScript for all new code
- Follow existing code patterns
- Add types for all function parameters and returns
- Use meaningful variable names
- Add comments for complex logic

### CSS
- Follow existing naming conventions
- Use BEM methodology where appropriate
- Keep styles modular and reusable
- Test on different screen sizes

### File Organization
```
src/
├── background.ts      # Background service worker
├── content.ts         # Content scripts
├── viewer.ts          # Main viewer logic
├── db.ts             # Database operations
├── services/         # External service integrations
├── *.html            # HTML pages
└── *.css             # Stylesheets
```

## Adding Features

### New Service Integration
1. Create service file in `src/services/`
2. Implement fallback mechanism
3. Add configuration to settings page
4. Update FEATURES.md
5. Add tests

### UI Components
1. Add HTML to appropriate file
2. Style in corresponding CSS file
3. Add TypeScript logic
4. Ensure responsive design
5. Test accessibility

### Database Changes
1. Update schema in db.ts
2. Handle migrations carefully
3. Test with existing data
4. Document changes

## Testing

### Manual Testing
- Test all features after changes
- Test with different PDF sizes
- Test with and without API keys
- Test on clean extension install
- Check browser console for errors

### Future Automated Testing
When adding automated tests:
- Write unit tests for services
- Add integration tests for DB operations
- Include E2E tests for critical paths
- Maintain test coverage

## Commit Messages

Use clear, descriptive commit messages:
```
Good: "Add zoom controls to PDF viewer"
Bad: "Update viewer.ts"

Good: "Fix sidebar not closing on mobile"
Bad: "Bug fix"
```

### Commit Message Format
```
<type>: <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

## Pull Request Guidelines

### Before Submitting
- [ ] Code builds without errors
- [ ] Extension loads in Chrome
- [ ] All features work as expected
- [ ] No console errors
- [ ] Code follows style guidelines
- [ ] Documentation updated

### PR Description
Include:
1. What changes were made
2. Why the changes were necessary
3. How to test the changes
4. Screenshots for UI changes
5. Any breaking changes

### Review Process
1. Maintainers will review your PR
2. Address any feedback
3. Once approved, PR will be merged
4. Your contribution will be credited

## Bug Reports

### Before Reporting
- Check existing issues
- Try latest version
- Verify it's reproducible
- Check browser console

### Bug Report Template
```markdown
**Description**
Clear description of the bug

**Steps to Reproduce**
1. Open PDF
2. Click button
3. Error occurs

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- Chrome version:
- Extension version:
- OS:

**Console Errors**
Paste any error messages

**Screenshots**
If applicable
```

## Feature Requests

### Before Requesting
- Check existing issues/PRs
- Ensure it fits project scope
- Consider implementation complexity

### Feature Request Template
```markdown
**Feature Description**
Clear description of the feature

**Use Case**
Why this feature is needed

**Proposed Solution**
How it could be implemented

**Alternatives Considered**
Other approaches

**Additional Context**
Any other information
```

## Code of Conduct

### Our Standards
- Be respectful and inclusive
- Accept constructive criticism
- Focus on what's best for the project
- Show empathy towards others

### Unacceptable Behavior
- Harassment or discrimination
- Trolling or insulting comments
- Personal or political attacks
- Publishing others' private information

## Questions?

- Open an issue for questions
- Check existing documentation
- Search closed issues/PRs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be acknowledged in:
- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to Documind! 🎉
