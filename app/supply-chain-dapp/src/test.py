from pathlib import Path

# Define the folder name and the list of file names
folder = Path("hooks")
files = [
    "useProductManager.js",
    "useStakeholderRegistry.js",
    "useDisputeManager.js",
    "useScoreEngine.js"
]

# Create the folder if it doesn't exist
folder.mkdir(exist_ok=True)

# Create each file inside the folder
for file_name in files:
    file_path = folder / file_name
    file_path.touch(exist_ok=True)

print("Folder structure created successfully!")
