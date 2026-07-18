import zipfile
import os

def zipdir(path, ziph):
    exclude_dirs = {'.git', 'node_modules', 'dist', '.next', 'build', '.npm', 'artifacts', 'attached_assets'}
    exclude_exts = {'.zip', '.gz', '.tar'}
    
    for root, dirs, files in os.walk(path):
        # Exclude directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            if any(file.endswith(ext) for ext in exclude_exts):
                continue
            if file == 'zip_script.py':
                continue
                
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, path)
            ziph.write(file_path, arcname)

if __name__ == '__main__':
    zipf = zipfile.ZipFile('Attendenz-Latest-UI.zip', 'w', zipfile.ZIP_DEFLATED)
    zipdir('.', zipf)
    zipf.close()
