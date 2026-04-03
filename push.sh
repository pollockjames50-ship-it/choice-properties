#!/bin/bash
# Quick push script for mobile development

cd /workspaces/choicepropertiesofficial

echo "📤 Pushing changes to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
  echo "✅ SUCCESS! Changes pushed to GitHub"
  echo ""
  echo "📊 Deployment status:"
  echo "   - Check GitHub: https://github.com/choicepropertyofficial1-collab/choicepropertiesofficial"
  echo "   - Supabase will auto-deploy in 1-2 minutes"
  echo "   - Cloudflare will auto-deploy in 1-2 minutes"
  echo ""
  echo "🧪 Next steps:"
  echo "   1. Wait 3-5 minutes for deployment"
  echo "   2. Try uploading a photo"
  echo "   3. Check Supabase logs for new debug output"
else
  echo "❌ FAILED! Error pushing to GitHub"
  echo "   Try again in a moment, or check your internet connection"
fi
