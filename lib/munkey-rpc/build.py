import os
import pathlib
from argparse import ArgumentParser, Namespace
from subprocess import call, check_call, CalledProcessError

def main(args):
    exe = "grpc_tools_node_protoc"
    root_path = pathlib.Path(args.out)
    node_modules = root_path.joinpath("node_modules")
    ts_plugin_path = node_modules.joinpath(".bin", "protoc-gen-ts")
    grpc_plugin_path = node_modules.joinpath(".bin", "grpc_tools_node_protoc_plugin")
    src_path = root_path.joinpath("src").resolve()
    
    out_path = root_path.joinpath("bin")
    ts_path = out_path.joinpath("ts").resolve()

    # Convert all plugin filepaths to use platform-specific extensions
    ts_plugin_path, grpc_plugin_path = extend_paths([ts_plugin_path, grpc_plugin_path])
    if os.name == "nt":
        exe = f"{exe}.cmd"
    ts_path.mkdir(exist_ok=True, parents=True)

    try:
        check_call([
            "protoc",
            f"--plugin=protoc-gen-ts={ts_plugin_path}",
            f"--plugin=protoc-gen-grpc={grpc_plugin_path}",
            f"--ts_out=grpc_js:{ts_path}",
            f"--js_out=import_style=commonjs:{ts_path}",
            f"--grpc_out=grpc_js:{ts_path}",
            f"-I{src_path}",
            "munkey.proto",
        ])
    except CalledProcessError as err:
        print(err)

def extend_paths(path_list: "list[pathlib.Path]"):
    if os.name == "nt":
        return [win_path.with_suffix(".cmd").resolve() for win_path in path_list]
    return path_list

if __name__ == "__main__":
    parser = ArgumentParser("proto-build")
    parser.add_argument("-o", "--out", type=str, default=str(pathlib.Path.cwd()))
    args = parser.parse_args()
    main(args)
