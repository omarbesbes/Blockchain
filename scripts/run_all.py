import subprocess

# List the commands you want to run in order.
# Adjust the command if your scripts have different names or paths.
scripts = [
    "npx hardhat run deploy.js --network localhost ",
    "npx hardhat run addFactories.js --network localhost ",
    "npx hardhat run addSuppliers.js --network localhost ",
    "npx hardhat run addproduct.js --network localhost ",
    "npx hardhat run addproduct.js --network localhost ",
    "npx hardhat run addproductSupplier.js --network localhost ",
    "npx hardhat run addproductSupplier.js --network localhost ",
    "npx hardhat run addproductSupplier.js --network localhost ",
    "npx hardhat run scoreRetailer.js --network localhost ",
]

def run_scripts_sequentially(scripts_list):
    for script in scripts_list:
        print(f"Running: {script}")
        # Run the command and capture output
        result = subprocess.run(script, shell=True, capture_output=True, text=True)
        
        # Check if the command executed successfully
        if result.returncode != 0:
            print(f"Error running {script}:\n{result.stderr}")
            # Optionally, exit the loop or raise an exception if a script fails.
            break
        else:
            print(result.stdout)
    print("All scripts executed sequentially.")

if __name__ == "__main__":
    run_scripts_sequentially(scripts)
