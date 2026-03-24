#!/usr/bin/env python3
import os
import subprocess
import json
import argparse

def main():
    parser = argparse.ArgumentParser(description='Push .env variables to Google Cloud Run')
    parser.add_argument('--service', default='taluithai-backend', help='Cloud Run service name')
    parser.add_argument('--region', default='asia-southeast3', help='Cloud Run region')
    parser.add_argument('--env-file', default='.env', help='Path to .env file')
    
    args = parser.parse_args()
    
    temp_env_file = "cloud_run_env.yaml"
    env_vars = {}
    
    if not os.path.exists(args.env_file):
        print(f"Error: {args.env_file} not found in the current directory.")
        return
        
    # Parse the .env file
    with open(args.env_file, 'r') as f:
        for line in f:
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
                
            if '=' in line:
                key, val = line.split('=', 1)
                key = key.strip()
                val = val.strip()
                
                # Remove surrounding quotes
                if val.startswith('"') and val.endswith('"'):
                    val = val[1:-1]
                elif val.startswith("'") and val.endswith("'"):
                    val = val[1:-1]
                    
                # Cloud Run reserved variables that cannot be set
                if key in ['PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION']:
                    print(f"Skipping reserved variable: {key}")
                    continue
                    
                env_vars[key] = str(val)

    if not env_vars:
        print(f"No valid environment variables found in {args.env_file}")
        return

    # Write to a temporary file (JSON is a valid subset of YAML, which gcloud accepts)
    with open(temp_env_file, 'w') as f:
        json.dump(env_vars, f, indent=2)
        
    print(f"Parsed {len(env_vars)} variables from {args.env_file}.")
    print(f"Updating Cloud Run service '{args.service}' in region '{args.region}'...")
    
    # Run the gcloud command
    try:
        subprocess.run([
            "gcloud", "run", "services", "update", args.service,
            f"--region={args.region}",
            f"--env-vars-file={temp_env_file}"
        ], check=True)
        print("\n✅ Successfully updated environment variables!")
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Error updating Cloud Run: {e}")
    except FileNotFoundError:
        print("\n❌ Error: 'gcloud' command not found. Please ensure Google Cloud SDK is installed and in your PATH.")
        
    # Clean up temporary file
    if os.path.exists(temp_env_file):
        os.remove(temp_env_file)

if __name__ == "__main__":
    main()
