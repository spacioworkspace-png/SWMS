// Quick test script to verify Supabase connection
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Environment variables not set!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔍 Testing Supabase connection...\n');
  
  try {
    // Test 1: Check if we can connect
    console.log('1. Testing connection...');
    const { data, error } = await supabase.from('spaces').select('count').limit(1);
    
    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('   ⚠️  Connection works, but tables don\'t exist yet.');
        console.log('   📝 You need to run the SQL script in Supabase SQL Editor.\n');
        console.log('   Go to: https://supabase.com/dashboard/project/vwruqgmsybbghcasypwe/sql');
        console.log('   Copy and paste the contents of supabase-schema.sql\n');
        return false;
      } else {
        throw error;
      }
    }
    
    console.log('   ✅ Connection successful!\n');
    
    // Test 2: Check if tables exist
    console.log('2. Checking tables...');
    const tables = ['spaces', 'customers', 'assignments', 'payments'];
    const results = {};
    
    for (const table of tables) {
      const { error: tableError } = await supabase.from(table).select('count').limit(1);
      results[table] = !tableError;
    }
    
    console.log('   Tables status:');
    for (const [table, exists] of Object.entries(results)) {
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
    }
    
    const allExist = Object.values(results).every(v => v);
    
    if (allExist) {
      console.log('\n✅ All tables exist! Your database is ready to use.');
      return true;
    } else {
      console.log('\n⚠️  Some tables are missing. Please run the SQL script.');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});

